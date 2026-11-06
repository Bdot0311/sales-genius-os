-- Atomic search-credit and daily-counter updates, and two unique guards.
--
-- enrich-lead and the free-tier search path used to read
-- search_credits_remaining and write the decreased value back. Two requests
-- could both read the same balance and both write it, so one credit paid for
-- two calls. The update below locks the subscription row, applies both
-- counters, and refuses a gated debit that would pass zero without writing.
--
-- sent_emails gains two partial unique indexes. One stops two dispatcher
-- passes from queueing the same sequence step. The other stops two
-- first-touch reservations for the same recipient and subject from both
-- reaching Gmail. Thread replies set gmail_thread_id and are not in that index.

CREATE OR REPLACE FUNCTION public.apply_search_meter(
  p_user_id uuid,
  p_credit_delta integer,
  p_daily_delta integer,
  p_description text,
  p_gate boolean DEFAULT true,
  p_daily_cap integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits integer;
  v_daily integer;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'apply_search_meter denied';
  END IF;

  SELECT COALESCE(search_credits_remaining, 0), COALESCE(daily_searches_used, 0)
    INTO v_credits, v_daily
    FROM public.subscriptions
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'no_subscription');
  END IF;

  IF p_gate AND COALESCE(p_credit_delta, 0) < 0 AND v_credits + p_credit_delta < 0 THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'insufficient',
      'credits', v_credits,
      'daily', v_daily
    );
  END IF;

  IF p_daily_cap IS NOT NULL AND COALESCE(p_daily_delta, 0) > 0 AND v_daily + p_daily_delta > p_daily_cap THEN
    RETURN jsonb_build_object(
      'applied', false,
      'reason', 'daily_cap',
      'credits', v_credits,
      'daily', v_daily
    );
  END IF;

  v_credits := GREATEST(0, v_credits + COALESCE(p_credit_delta, 0));
  v_daily := GREATEST(0, v_daily + COALESCE(p_daily_delta, 0));

  UPDATE public.subscriptions
     SET search_credits_remaining = v_credits,
         daily_searches_used = v_daily
   WHERE user_id = p_user_id;

  IF COALESCE(p_credit_delta, 0) <> 0 THEN
    INSERT INTO public.search_transactions (user_id, type, amount, balance_after, description)
    VALUES (
      p_user_id,
      CASE WHEN p_credit_delta < 0 THEN 'usage' ELSE 'refund' END,
      p_credit_delta,
      v_credits,
      left(COALESCE(p_description, ''), 500)
    );
  END IF;

  RETURN jsonb_build_object('applied', true, 'credits', v_credits, 'daily', v_daily);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_search_meter(uuid, integer, integer, text, boolean, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_search_meter(uuid, integer, integer, text, boolean, integer)
  TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS sent_emails_one_live_sequence_step
  ON public.sent_emails (enrollment_id, sequence_step)
  WHERE enrollment_id IS NOT NULL
    AND sequence_step IS NOT NULL
    AND status IN ('scheduled', 'pending', 'sent', 'delivered', 'opened', 'clicked', 'replied');

CREATE UNIQUE INDEX IF NOT EXISTS sent_emails_one_open_first_touch
  ON public.sent_emails (user_id, to_email, subject)
  WHERE status = 'pending'
    AND gmail_thread_id IS NULL;
