/*
 * Warmup was erasing the one number it exists to measure, and its daily
 * target was a suggestion.
 *
 * ── Spam recovery destroyed the spam signal ─────────────────────────────
 *
 * The receive phase searches each pooled mailbox for warmup mail from the last
 * three days, records where it landed in `folder_detected`, and — when it
 * landed in spam — moves it to the inbox and clears the SPAM label. That
 * recovery is the right behaviour. What followed was not: an hour later the
 * next run re-listed the same message, found it in the inbox because *it had
 * put it there*, and overwrote `folder_detected` with 'inbox'.
 *
 * `get_deliverability_live_stats` reads exactly that column:
 *
 *     count(*) FILTER (WHERE w.folder_detected = 'spam') AS warmup_spam
 *
 * and the reputation score deducts up to 25 points on
 * `warmup_spam / (warmup_inbox + warmup_spam)`. With the column rewritten
 * within the hour, that ratio is pinned at zero. Every pooled mailbox reads
 * 100% inbox placement and loses no reputation points, however much of its
 * warmup mail is actually being filtered. The headline number on the
 * Deliverability page could not report the problem it was built to report.
 *
 * Placement is where the recipient's mailbox put the message on arrival. That
 * is a fact about one moment, so it gets recorded once. `recipient_message_id`
 * is what makes "once" enforceable: the id the message has in the *recipient's*
 * mailbox, written when it is first handled, so later runs skip it instead of
 * re-reading it and re-deciding. It also stops the receive phase paying for a
 * Gmail GET on every message, every hour, for three days after it arrives.
 *
 * ── The daily target was advisory ──────────────────────────────────────
 *
 * The send phase counted today's rows, subtracted, and inserted. Count-then-
 * insert is not atomic, and two runs overlap by design: the cron is hourly and
 * `fetchWarmupMessages`'s sibling "run warmup now" button posts to the same
 * function, from any signed-in user, for the whole shared pool. Two
 * simultaneous runs both read the same count and both send up to the per-run
 * cap, so the ramp a warmup pool depends on is whatever the traffic happens to
 * allow. Overshooting the ramp is not a cosmetic miss — it is the exact
 * behaviour that gets a warming domain filtered.
 *
 * `claim_warmup_sends` takes a per-sender advisory lock for the length of its
 * transaction and does the counting and the inserting inside it, so a
 * concurrent caller waits and then sees the rows the first one wrote. The
 * button becoming a no-op when the allowance is spent is the same fix.
 */

ALTER TABLE public.warmup_messages
  -- The id this message has in the RECIPIENT's mailbox. Set the first time the
  -- receive phase handles it; its presence means "already handled", which is
  -- what keeps placement a single observation.
  ADD COLUMN IF NOT EXISTS recipient_message_id text;

/*
 * The skip list's access path: one lookup per mailbox per run.
 *
 * Partial, because a row only joins this index once its message has been seen
 * by the recipient — which for most rows is never, since the sender's own copy
 * is never scanned.
 */
CREATE INDEX IF NOT EXISTS idx_warmup_messages_recipient_seen
  ON public.warmup_messages (to_account_id, recipient_message_id)
  WHERE recipient_message_id IS NOT NULL;

/*
 * When this message was moved out of spam, if it ever was.
 *
 * Recovery and placement have to be tracked apart. Recording placement and
 * then recovering, in that order, is the only order that cannot lose the
 * reading — but it means a message can be recorded as 'spam' and still be
 * waiting to be moved, and nothing in the row said which. Without this
 * column, a run that recovered a message and then failed to write the reading
 * left the next run looking at a message sitting in the inbox because we put
 * it there, with 'spam' never recorded.
 */
ALTER TABLE public.warmup_messages
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz;

ALTER TABLE public.warmup_pool
  -- When the receive phase last scanned this mailbox. The scan is bounded by a
  -- wall-clock budget, so without an order the same few mailboxes at the front
  -- of the list would be the only ones ever scanned.
  ADD COLUMN IF NOT EXISTS last_scan_at timestamptz;

/*
 * Claim this sender's warmup sends for the run, atomically.
 *
 * Returns one row per send the caller may make, already inserted and already
 * paired with a recipient, so the caller's only remaining job is the Gmail POST
 * and writing the message id back. A claim with no Gmail id is an unfinished
 * send, which is also how a killed run is recognised.
 *
 * p_to_accounts arrives in the caller's preferred pairing order (different
 * owner first) and is consumed from the front.
 */
CREATE OR REPLACE FUNCTION public.claim_warmup_sends(
  p_from_account uuid,
  p_to_accounts  uuid[],
  p_daily_target integer,
  p_per_run      integer
)
RETURNS TABLE (id uuid, to_account_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used  integer;
  v_allow integer;
BEGIN
  -- Only the orchestrator claims sends. A signed-in user may *trigger* a run;
  -- they may not mint warmup rows for mailboxes that are not theirs.
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'claim_warmup_sends is internal';
  END IF;

  /*
   * Serialise this sender for the rest of the transaction. The lock is per
   * sender rather than global so a large pool still claims in parallel, and it
   * is an xact lock so it is released on commit however the statement ends.
   */
  PERFORM pg_advisory_xact_lock(hashtextextended(p_from_account::text, 0));

  /*
   * Hand back claims no live run can still be holding.
   *
   * A row with no Gmail id ten minutes after it was claimed belongs to a run
   * that was killed between the insert and the send. Left in place it would
   * count against the daily target for the rest of the day, quietly shrinking
   * the ramp every time a run died. Ten minutes is far longer than a send takes
   * and far shorter than the hourly cadence, so it cannot collide with a run
   * that is merely slow.
   */
  DELETE FROM public.warmup_messages
   WHERE from_account_id = p_from_account
     AND gmail_message_id IS NULL
     AND sent_at < now() - interval '10 minutes';

  /*
   * Everything claimed today counts, sent or in flight. Counting only sent
   * rows would let two runs inside the same ten minutes both claim a full
   * allowance, which is the race this function exists to close.
   */
  SELECT count(*) INTO v_used
    FROM public.warmup_messages
   WHERE from_account_id = p_from_account
     AND sent_at >= date_trunc('day', now());

  v_allow := least(
    greatest(coalesce(p_daily_target, 0) - v_used, 0),
    greatest(coalesce(p_per_run, 0), 0),
    coalesce(array_length(p_to_accounts, 1), 0)
  );
  IF v_allow <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH claimed AS (
    INSERT INTO public.warmup_messages (from_account_id, to_account_id)
    SELECT p_from_account, t.acct
      FROM unnest(p_to_accounts[1:v_allow]) AS t(acct)
    RETURNING warmup_messages.id, warmup_messages.to_account_id
  )
  SELECT claimed.id, claimed.to_account_id FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_warmup_sends(uuid, uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_warmup_sends(uuid, uuid[], integer, integer) TO service_role;
