-- Invoice rollover used to add the plan allowance to a balance read before
-- this function locked the row, then write that sum back as an absolute
-- number. Two invoices, or an invoice and a search debit, could both read
-- the same balance. The add now happens after FOR UPDATE.
--
-- The argument list is unchanged: (uuid, text, timestamptz, jsonb).
-- A new jsonb key, search_credits_delta, means "add this integer to the
-- locked balance". search_credits_remaining still means "set the balance to
-- this integer" for checkout and yearly replacement. If both keys are
-- present, the delta is what changes the balance.
--
-- A credit grant is recorded by event id, not only by last_stripe_event_id.
-- A newer event can update status first. An older invoice that arrives
-- afterwards does not move status backwards, and it still grants its
-- allowance once. Delivering the same event again does not grant again.

CREATE TABLE IF NOT EXISTS public.stripe_credit_grants (
  event_id text PRIMARY KEY,
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_credit_grants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON TABLE public.stripe_credit_grants FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.stripe_credit_grants FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.stripe_credit_grants FROM authenticated';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_stripe_event_to_subscription(
  _user_id uuid,
  _event_id text,
  _event_created_at timestamptz,
  _updates jsonb
)
RETURNS TABLE(applied boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _last_id text;
  _last_at timestamptz;
  _remaining integer;
  _delta integer;
  _granted boolean := false;
  _stale boolean := false;
  _role text;
BEGIN
  -- A blank claim is the same as no claim. Supabase sets anon or
  -- authenticated on user requests. A direct database session used by a
  -- migration has neither, and that session is allowed.
  _role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  IF _role IS NULL THEN
    _role := NULLIF(auth.role(), '');
  END IF;
  IF _role IS NOT NULL AND _role <> 'service_role' THEN
    RAISE EXCEPTION 'apply_stripe_event_to_subscription denied';
  END IF;

  SELECT last_stripe_event_id, last_stripe_event_at, COALESCE(search_credits_remaining, 0)
    INTO _last_id, _last_at, _remaining
    FROM public.subscriptions
   WHERE user_id = _user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'no_subscription_row';
    RETURN;
  END IF;

  _stale := _last_at IS NOT NULL AND _event_created_at IS NOT NULL AND _event_created_at < _last_at;

  IF _updates ? 'search_credits_delta' AND _updates->>'search_credits_delta' IS NOT NULL THEN
    _delta := (_updates->>'search_credits_delta')::int;
    IF _delta > 0 THEN
      INSERT INTO public.stripe_credit_grants (event_id, user_id, delta)
      VALUES (_event_id, _user_id, _delta)
      ON CONFLICT (event_id) DO NOTHING;
      IF FOUND THEN
        _granted := true;
        _remaining := _remaining + _delta;
      END IF;
    END IF;
  END IF;

  IF _last_id IS NOT NULL AND _last_id = _event_id AND NOT _granted THEN
    RETURN QUERY SELECT false, 'duplicate_event';
    RETURN;
  END IF;

  IF _stale AND NOT _granted THEN
    RETURN QUERY SELECT false, 'stale_event';
    RETURN;
  END IF;

  IF _stale AND _granted THEN
    UPDATE public.subscriptions
       SET search_credits_remaining = _remaining,
           updated_at = now()
     WHERE user_id = _user_id;
    INSERT INTO public.search_transactions (user_id, type, amount, balance_after, description)
    VALUES (_user_id, 'rollover', _delta, _remaining, left('Invoice credit grant ' || _event_id, 500));
    RETURN QUERY SELECT false, 'stale_credits_applied';
    RETURN;
  END IF;

  UPDATE public.subscriptions s
    SET
      plan = CASE WHEN _updates ? 'plan' AND _updates->>'plan' IS NOT NULL
                  THEN (_updates->>'plan')::subscription_plan ELSE s.plan END,
      previous_plan = CASE WHEN _updates ? 'previous_plan'
                  THEN (_updates->>'previous_plan')::subscription_plan ELSE s.previous_plan END,
      status = CASE WHEN _updates ? 'status' AND _updates->>'status' IS NOT NULL
                  THEN _updates->>'status' ELSE s.status END,
      account_status = CASE WHEN _updates ? 'account_status' AND _updates->>'account_status' IS NOT NULL
                  THEN _updates->>'account_status' ELSE s.account_status END,
      stripe_customer_id = CASE WHEN _updates ? 'stripe_customer_id'
                  THEN _updates->>'stripe_customer_id' ELSE s.stripe_customer_id END,
      stripe_subscription_id = CASE WHEN _updates ? 'stripe_subscription_id'
                  THEN _updates->>'stripe_subscription_id' ELSE s.stripe_subscription_id END,
      search_credits_base = CASE WHEN _updates ? 'search_credits_base' AND _updates->>'search_credits_base' IS NOT NULL
                  THEN (_updates->>'search_credits_base')::int ELSE s.search_credits_base END,
      search_credits_remaining = CASE
                  WHEN _granted THEN _remaining
                  WHEN _updates ? 'search_credits_remaining' AND _updates->>'search_credits_remaining' IS NOT NULL
                  THEN (_updates->>'search_credits_remaining')::int
                  ELSE s.search_credits_remaining END,
      leads_limit = CASE WHEN _updates ? 'leads_limit' AND _updates->>'leads_limit' IS NOT NULL
                  THEN (_updates->>'leads_limit')::int ELSE s.leads_limit END,
      daily_searches_used = CASE WHEN _updates ? 'daily_searches_used' AND _updates->>'daily_searches_used' IS NOT NULL
                  THEN (_updates->>'daily_searches_used')::int ELSE s.daily_searches_used END,
      current_period_start = CASE WHEN _updates ? 'current_period_start'
                  THEN (_updates->>'current_period_start')::timestamptz ELSE s.current_period_start END,
      current_period_end = CASE WHEN _updates ? 'current_period_end'
                  THEN (_updates->>'current_period_end')::timestamptz ELSE s.current_period_end END,
      credits_reset_at = CASE WHEN _updates ? 'credits_reset_at'
                  THEN (_updates->>'credits_reset_at')::timestamptz ELSE s.credits_reset_at END,
      trial_end_date = CASE WHEN _updates ? 'trial_end_date'
                  THEN (_updates->>'trial_end_date')::timestamptz ELSE s.trial_end_date END,
      cancel_at_period_end = CASE WHEN _updates ? 'cancel_at_period_end'
                  THEN (_updates->>'cancel_at_period_end')::boolean ELSE s.cancel_at_period_end END,
      canceled_at = CASE WHEN _updates ? 'canceled_at'
                  THEN (_updates->>'canceled_at')::timestamptz ELSE s.canceled_at END,
      payment_failed_at = CASE WHEN _updates ? 'payment_failed_at'
                  THEN (_updates->>'payment_failed_at')::timestamptz ELSE s.payment_failed_at END,
      last_payment_error = CASE WHEN _updates ? 'last_payment_error'
                  THEN _updates->>'last_payment_error' ELSE s.last_payment_error END,
      last_stripe_event_id = _event_id,
      last_stripe_event_at = COALESCE(_event_created_at, now()),
      updated_at = now()
    WHERE s.user_id = _user_id;

  IF _granted THEN
    INSERT INTO public.search_transactions (user_id, type, amount, balance_after, description)
    VALUES (_user_id, 'rollover', _delta, _remaining, left('Invoice credit grant ' || _event_id, 500));
  END IF;

  RETURN QUERY SELECT true, 'applied';
END;
$$;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.apply_stripe_event_to_subscription(uuid, text, timestamptz, jsonb) FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.apply_stripe_event_to_subscription(uuid, text, timestamptz, jsonb) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.apply_stripe_event_to_subscription(uuid, text, timestamptz, jsonb) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.apply_stripe_event_to_subscription(uuid, text, timestamptz, jsonb) TO service_role';
  END IF;
END $$;
