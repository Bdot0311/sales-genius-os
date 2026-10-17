/*
 * The allowance ledger charged for mail nobody received.
 *
 * Both caps count `sent_emails` rows whose status is one of
 * ('sent','delivered','opened','clicked','replied'). 'bounced' is absent, and
 * has been since `get_monthly_email_count` was written: a bounce left the
 * building, but the product does not spend a paid allowance on a message that
 * never arrived. The ledger added one row per successful send and never heard
 * about the bounce — `sync-bounces` only flips `sent_emails.status` — so
 * `greatest(ledger, surviving history)` kept the higher number and the rule
 * stopped being true the moment the ledger became the larger side.
 *
 * The effect is worst on the account least able to fix it: a list with bad
 * data burns its daily allowance on bounces and then cannot send until the
 * next reset, which is also when it would have learned anything.
 *
 * So a bounce credits its ledger row. `sent_email_id` is what makes that
 * possible — without it a ledger row is anonymous and there is nothing for
 * `sync-bounces` to find. The column is nullable and the credit is keyed on
 * it, so a send recorded without one simply stays charged: the safe direction
 * for a number that gates sending.
 *
 * ── A note on what this does not decide ────────────────────────────────
 *
 * Not charging for bounces means an account with a very bad list can keep
 * sending past its nominal allowance, because each bounce gives the credit
 * back. That is not introduced here — the monthly cap has worked this way all
 * along — and the bounce rate is already watched by
 * deliverability-alerts-scan, but nothing hard-stops sending on it. Whether a
 * bounce should cost an allowance is a pricing decision, so this migration
 * restores the rule the code already stated rather than quietly changing it.
 */

ALTER TABLE public.send_allowance_usage
  -- The send this row accounts for. Nullable: a row without one can never be
  -- credited, which charges the account, which is the safe failure.
  ADD COLUMN IF NOT EXISTS sent_email_id uuid,
  -- Set when the send bounced. A credited row stops counting against either cap.
  ADD COLUMN IF NOT EXISTS credited_at timestamptz;

/*
 * The credit's access path. Partial and unique: one ledger row per send, so a
 * double-delivered bounce notification cannot credit twice, and a send
 * recorded twice by mistake cannot hide behind one credit.
 */
CREATE UNIQUE INDEX IF NOT EXISTS idx_send_allowance_usage_sent_email
  ON public.send_allowance_usage (sent_email_id)
  WHERE sent_email_id IS NOT NULL;

/*
 * Record a send against the allowance, naming the send.
 *
 * The one-argument form is dropped rather than kept alongside: with a
 * defaulted second parameter both would match a one-argument call and
 * Postgres would refuse it as ambiguous.
 */
DROP FUNCTION IF EXISTS public.increment_daily_emails_sent(uuid);

CREATE OR REPLACE FUNCTION public.increment_daily_emails_sent(
  _user_id        uuid,
  _sent_email_id  uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  /*
   * This takes a user id and runs as definer, so one account could otherwise
   * inflate another's usage and stop their sends. Only the senders call it,
   * and they hold the service role.
   */
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'increment_daily_emails_sent is internal';
  END IF;

  /*
   * ON CONFLICT, because the senders can retry: the Gmail send succeeded, the
   * row was written, and the call was made again. Charging twice for one send
   * is the same class of wrong as charging for a bounce.
   */
  INSERT INTO public.send_allowance_usage (user_id, sent_email_id)
  VALUES (_user_id, _sent_email_id)
  ON CONFLICT (sent_email_id) WHERE sent_email_id IS NOT NULL DO NOTHING;

  -- The counter is display only since the caps moved to counting. Still
  -- maintained for every account, lapsed included: a number frozen at zero
  -- reads as "you have sent nothing today" to someone who has been sending.
  UPDATE public.subscriptions
     SET daily_emails_sent = COALESCE(daily_emails_sent, 0) + 1
   WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_daily_emails_sent(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_daily_emails_sent(uuid, uuid) TO service_role;

/*
 * Give back the allowance a bounced send spent.
 *
 * Idempotent on `credited_at IS NULL`, so a bounce notification delivered
 * twice credits once.
 */
CREATE OR REPLACE FUNCTION public.credit_bounced_send(_sent_email_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'credit_bounced_send is internal';
  END IF;

  UPDATE public.send_allowance_usage
     SET credited_at = now()
   WHERE sent_email_id = _sent_email_id
     AND credited_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_bounced_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_bounced_send(uuid) TO service_role;

/*
 * Both caps, now ignoring credited rows on the ledger side. The history side
 * already ignored bounces, by leaving 'bounced' out of the status list, so the
 * two sides of greatest() agree on what a send is again.
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
        AND u.credited_at IS NULL
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
        AND u.credited_at IS NULL
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
