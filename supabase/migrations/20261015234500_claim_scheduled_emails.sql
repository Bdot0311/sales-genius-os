/*
 * Nothing stopped two runs of the sender from sending the same email twice.
 *
 * `process-scheduled-emails` is scheduled `* * * * *`. Each run reads up to
 * twenty rows at `status = 'scheduled'` with no claim and no compare-and-set,
 * processes them strictly one after another, and writes `status = 'sent'` only
 * after each Gmail POST returns. Between that batch read and the POST it never
 * reads the row again — verified: there is no `from("sent_emails")` anywhere
 * between the two.
 *
 * So a run holds a stale snapshot for its whole duration, and the function has
 * no wall-clock budget to keep that duration under the cron interval. Twenty
 * sequential sends, each with a Gmail call, up to eight Supabase round trips
 * and sometimes an OAuth token refresh, is comfortably over sixty seconds on a
 * slow minute. The next cron then reads the rows the first run has not reached
 * yet and sends them — and the first run sends them again when it gets there,
 * because it never checks.
 *
 * A duplicate cold email to a prospect is not a glitch in this product. It is
 * the thing that gets a domain complained about, and it is unrecoverable once
 * it has left.
 *
 * ── Two timestamps, because one cannot answer the question ──────────────
 *
 * `send_claimed_at` says a run has taken the row. `send_attempted_at` says the
 * Gmail POST has been started for it. The second exists because a claim left
 * unsettled is ambiguous and the two cases need opposite handling:
 *
 *   claimed, never attempted → the run was killed before reaching it. Nothing
 *                              was sent. Safe to hand back.
 *   claimed and attempted    → the POST may have gone out and the status write
 *                              may have been what died. Re-sending risks the
 *                              duplicate this whole migration exists to stop,
 *                              so it is failed with a reason the user can read
 *                              instead, and they decide whether to resend.
 *
 * Erring toward a visible dropped email rather than an invisible duplicate is
 * the right direction here: the user can resend one, and cannot unsend one.
 *
 * ── Fair across accounts, for the same reason the drafting queue is ─────
 *
 * Twenty sends a minute is the whole product's capacity. Ordered by due time
 * alone, one account with 10,000 queued emails owns that capacity for eight
 * hours and every other account's 9am send lands in the evening. Same
 * round-robin as 20261015230000: each account's due emails are numbered by
 * `scheduled_at`, and the batch is taken in that turn order, so each account's
 * oldest-due comes before anyone's second. Within an account, due order is
 * exactly preserved.
 */

ALTER TABLE public.sent_emails
  -- A run has taken this row and intends to send it.
  ADD COLUMN IF NOT EXISTS send_claimed_at timestamptz,
  -- The Gmail POST has been started for it. Set immediately before, never after.
  ADD COLUMN IF NOT EXISTS send_attempted_at timestamptz;

/*
 * The claim's access path: due rows per account, oldest first.
 *
 * Partial on the only status that can be claimed, so the index stays the size
 * of the backlog rather than the size of the sent archive — which is the table
 * that grows forever.
 */
CREATE INDEX IF NOT EXISTS idx_sent_emails_claimable
  ON public.sent_emails (user_id, scheduled_at, id)
  WHERE status = 'scheduled';

/*
 * Take a batch, atomically.
 *
 * `FOR UPDATE OF c SKIP LOCKED` is what makes two simultaneous runs take
 * disjoint sets. The candidate pool is `p_limit * 4` per account for the same
 * reason the drafting claim keeps headroom: a pool that only just covers one
 * batch starves a second concurrent run.
 *
 * A row already claimed is invisible here until the reaper settles it. That is
 * deliberate — the alternative is a time-based reclaim in this function, which
 * is precisely the race it exists to remove.
 */
CREATE OR REPLACE FUNCTION public.claim_due_scheduled_emails(p_limit integer DEFAULT 20)
RETURNS SETOF public.sent_emails
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH tenants AS (
    SELECT DISTINCT c.user_id
      FROM public.sent_emails c
     WHERE c.status = 'scheduled'
       AND c.send_claimed_at IS NULL
       AND c.scheduled_at IS NOT NULL
       AND c.scheduled_at <= now()
  ),
  candidates AS (
    SELECT x.id,
           row_number() OVER (ORDER BY x.turn, x.scheduled_at, x.id) AS ord
      FROM tenants t
     CROSS JOIN LATERAL (
       SELECT c.id,
              c.scheduled_at,
              row_number() OVER (ORDER BY c.scheduled_at, c.id) AS turn
         FROM public.sent_emails c
        WHERE c.status = 'scheduled'
          AND c.send_claimed_at IS NULL
          AND c.scheduled_at IS NOT NULL
          AND c.scheduled_at <= now()
          AND c.user_id = t.user_id
        ORDER BY c.scheduled_at, c.id
        LIMIT GREATEST(p_limit, 1) * 4
     ) x
  ),
  locked AS (
    SELECT c.id
      FROM public.sent_emails c
      JOIN candidates cd ON cd.id = c.id
     WHERE c.status = 'scheduled'
       AND c.send_claimed_at IS NULL
     ORDER BY cd.ord
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE OF c SKIP LOCKED
  )
  UPDATE public.sent_emails e
     SET send_claimed_at = now()
   WHERE e.id IN (SELECT id FROM locked)
  RETURNING e.*;
$$;

REVOKE ALL ON FUNCTION public.claim_due_scheduled_emails(integer) FROM public, anon, authenticated;

/*
 * Mark this row as being sent, and say whether we won the right to send it.
 *
 * Returns the id when this caller set `send_attempted_at`, and nothing when it
 * was already set. The claim above should make that impossible; this is the
 * line that holds if it ever is not, and it sits immediately before the only
 * irreversible call in the product. A guard this cheap in front of a duplicate
 * email is not redundancy worth economising on.
 */
CREATE OR REPLACE FUNCTION public.begin_scheduled_email_send(p_id uuid)
RETURNS TABLE (id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.sent_emails e
     SET send_attempted_at = now()
   WHERE e.id = p_id
     AND e.status = 'scheduled'
     AND e.send_attempted_at IS NULL
  RETURNING e.id;
$$;

REVOKE ALL ON FUNCTION public.begin_scheduled_email_send(uuid) FROM public, anon, authenticated;

/*
 * Hand back a claim this run is not going to use.
 *
 * The budget stop needs this: a run that stops early must release what it did
 * not reach, or those emails wait fifteen minutes for the reaper for no
 * reason. Only rows this caller still holds unattempted move, so a row another
 * run has since taken is never disturbed.
 */
CREATE OR REPLACE FUNCTION public.release_scheduled_email_claims(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE released integer;
BEGIN
  UPDATE public.sent_emails
     SET send_claimed_at = NULL
   WHERE id = ANY(p_ids)
     AND status = 'scheduled'
     AND send_claimed_at IS NOT NULL
     AND send_attempted_at IS NULL;
  GET DIAGNOSTICS released = ROW_COUNT;
  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_scheduled_email_claims(uuid[]) FROM public, anon, authenticated;

/*
 * A claim nobody came back for.
 *
 * Fifteen minutes is well past the platform's own kill time for an edge
 * function, so anything still held after it belongs to a run that is gone.
 * The two cases part here, exactly as described at the top of this file.
 */
CREATE OR REPLACE FUNCTION public.release_stale_scheduled_email_claims()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE released integer;
BEGIN
  -- Never attempted: nothing left the building. Hand it straight back.
  UPDATE public.sent_emails
     SET send_claimed_at = NULL
   WHERE status = 'scheduled'
     AND send_claimed_at < now() - interval '15 minutes'
     AND send_attempted_at IS NULL;
  GET DIAGNOSTICS released = ROW_COUNT;

  /*
   * Attempted and never settled. This may already be in the recipient's inbox,
   * so it is not sent again. Failing it with a reason puts the decision where
   * it belongs — in front of the person who can check whether it arrived.
   */
  UPDATE public.sent_emails
     SET status = 'failed',
         error_message = COALESCE(
           error_message,
           'The send was interrupted and we could not confirm whether it went out. '
           || 'It was not retried, because a duplicate cannot be taken back. '
           || 'Check the recipient''s thread and resend if it did not arrive.'
         ),
         failed_at = now()
   WHERE status = 'scheduled'
     AND send_attempted_at IS NOT NULL
     AND send_attempted_at < now() - interval '15 minutes';

  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_scheduled_email_claims() FROM public, anon, authenticated;
