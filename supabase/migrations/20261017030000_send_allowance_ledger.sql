/*
 * A send allowance you can delete your way out of is not an allowance.
 *
 * Moving the daily cap onto a live count of `sent_emails` fixed one hole and
 * opened another: `delete-sent-emails` lets a signed-in user permanently
 * delete their own rows by id, and `agent-chat` exposes the same delete as a
 * tool. So an account could send its full daily allowance, delete the records,
 * and send the allowance again — as many times as it liked. The monthly cap
 * has read `sent_emails` the same way since it was written, so it had this
 * property already.
 *
 * Deleting your sent history is a real product capability and should stay one.
 * What has to stop is deletion moving the allowance. So usage gets its own
 * record: one append-only row per send, with nothing in the app that can
 * remove it, and the caps count that instead.
 *
 * ── greatest(), not a backfill ─────────────────────────────────────────
 *
 * Both caps take `greatest(ledger, live)`. Sends that happened before this
 * migration have no ledger row, so the live count carries them until the
 * ledger catches up — no backfill, and no window where today's cap reads zero
 * because the ledger started empty. After a deletion the live count drops and
 * the ledger holds, which is the whole point. The two can only disagree in one
 * direction: the ledger is never larger than the sends that actually happened,
 * because it is only written after one.
 */

CREATE TABLE IF NOT EXISTS public.send_allowance_usage (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- The only access path either cap uses: one user's rows since a boundary.
CREATE INDEX IF NOT EXISTS idx_send_allowance_usage_user_time
  ON public.send_allowance_usage (user_id, sent_at DESC);

ALTER TABLE public.send_allowance_usage ENABLE ROW LEVEL SECURITY;

/*
 * No policies, and no grants to anon or authenticated. The table is written by
 * the senders under the service role and read by the two SECURITY DEFINER
 * count functions below. A row nobody in the app can delete is the entire
 * reason it exists, so it is not reachable from a session at all.
 */
REVOKE ALL ON public.send_allowance_usage FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.send_allowance_usage_id_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.send_allowance_usage TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.send_allowance_usage_id_seq TO service_role;

/*
 * One call on every successful send, as before — it now writes the allowance
 * row as well as the counter the Outreach and Deliverability panels display.
 *
 * Folded into the existing function rather than added beside it so there is
 * one place a send is recorded. Two calls would eventually be one call.
 */
CREATE OR REPLACE FUNCTION public.increment_daily_emails_sent(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  /*
   * This takes a user id and runs as definer, and it was executable by every
   * signed-in user — so one account could inflate another's usage and stop
   * their sends. Only the senders call it, and they hold the service role.
   */
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'increment_daily_emails_sent is internal';
  END IF;

  INSERT INTO public.send_allowance_usage (user_id) VALUES (_user_id);

  -- The counter is display only since the caps moved to counting. Still
  -- maintained for every account, lapsed included: a number frozen at zero
  -- reads as "you have sent nothing today" to someone who has been sending.
  UPDATE public.subscriptions
     SET daily_emails_sent = COALESCE(daily_emails_sent, 0) + 1
   WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_daily_emails_sent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_daily_emails_sent(uuid) TO service_role;

/*
 * Today's sends. The ledger, or the surviving history, whichever is larger.
 *
 * Raises rather than returning zero when the caller is not entitled to the
 * number: both senders treat a non-number as unreadable and refuse the send,
 * so a quiet zero would read as "nothing sent today" and wave the send
 * through.
 */
CREATE OR REPLACE FUNCTION public.get_daily_email_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  /*
   * IS DISTINCT FROM, because `<>` against a null is null, not true. A session
   * with no auth.uid() made the condition null, the IF never fired, and the
   * check passed — which is how this read any account's usage until a test
   * with a null uid caught it.
   */
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'get_daily_email_count is scoped to the caller';
  END IF;

  RETURN greatest(
    (SELECT count(*) FROM public.send_allowance_usage u
      WHERE u.user_id = p_user_id
        AND u.sent_at >= date_trunc('day', now())),
    (SELECT count(*) FROM public.sent_emails s
      WHERE s.user_id = p_user_id
        AND s.status IN ('sent','delivered','opened','clicked','replied')
        AND s.sent_at >= date_trunc('day', now()))
  )::int;
END;
$$;

REVOKE ALL ON FUNCTION public.get_daily_email_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_email_count(UUID) TO authenticated, service_role;

/*
 * This month's sends, by the same rule. Same statuses as the daily count, so
 * the two caps cannot disagree about what a send is.
 */
CREATE OR REPLACE FUNCTION public.get_monthly_email_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'get_monthly_email_count is scoped to the caller';
  END IF;

  RETURN greatest(
    (SELECT count(*) FROM public.send_allowance_usage u
      WHERE u.user_id = p_user_id
        AND u.sent_at >= date_trunc('month', now())),
    (SELECT count(*) FROM public.sent_emails s
      WHERE s.user_id = p_user_id
        AND s.status IN ('sent','delivered','opened','clicked','replied')
        AND s.sent_at >= date_trunc('month', now()))
  )::int;
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_email_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_email_count(UUID) TO authenticated, service_role;
