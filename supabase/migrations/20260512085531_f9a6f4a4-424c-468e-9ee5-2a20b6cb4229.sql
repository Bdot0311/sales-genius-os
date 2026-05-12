
-- 1) Idempotency key on webhook events
ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS idempotency_key text;

UPDATE public.stripe_webhook_events
  SET idempotency_key = event_id
  WHERE idempotency_key IS NULL;

ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_swe_idempotency_key
  ON public.stripe_webhook_events(idempotency_key);

-- 2) Per-subscription event ordering
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS last_stripe_event_id text,
  ADD COLUMN IF NOT EXISTS last_stripe_event_at timestamptz;

-- 3) Atomic claim function for webhook processing
CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  _event_id text,
  _event_type text,
  _payload jsonb,
  _idempotency_key text DEFAULT NULL
)
RETURNS TABLE(row_id uuid, attempts int, max_attempts int, claimed boolean, already_succeeded boolean, in_progress boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.stripe_webhook_events;
  _key text := COALESCE(_idempotency_key, _event_id);
BEGIN
  LOOP
    SELECT * INTO _row FROM public.stripe_webhook_events
      WHERE event_id = _event_id FOR UPDATE;
    IF FOUND THEN EXIT; END IF;
    BEGIN
      INSERT INTO public.stripe_webhook_events (event_id, event_type, payload, idempotency_key, status, attempts)
      VALUES (_event_id, _event_type, _payload, _key, 'pending', 0)
      RETURNING * INTO _row;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- another tx inserted concurrently, retry select
    END;
  END LOOP;

  IF _row.status = 'succeeded' THEN
    RETURN QUERY SELECT _row.id, _row.attempts, _row.max_attempts, false, true, false;
    RETURN;
  END IF;

  IF _row.status = 'processing' AND _row.updated_at > now() - interval '10 minutes' THEN
    RETURN QUERY SELECT _row.id, _row.attempts, _row.max_attempts, false, false, true;
    RETURN;
  END IF;

  UPDATE public.stripe_webhook_events
    SET status = 'processing',
        attempts = _row.attempts + 1,
        last_error = NULL,
        next_retry_at = NULL,
        updated_at = now()
    WHERE id = _row.id;

  RETURN QUERY SELECT _row.id, (_row.attempts + 1), _row.max_attempts, true, false, false;
END;
$$;

-- 4) Idempotent subscription update keyed by event id + timestamp
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
BEGIN
  SELECT last_stripe_event_id, last_stripe_event_at
    INTO _last_id, _last_at
    FROM public.subscriptions
    WHERE user_id = _user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'no_subscription_row';
    RETURN;
  END IF;

  IF _last_id IS NOT NULL AND _last_id = _event_id THEN
    RETURN QUERY SELECT false, 'duplicate_event';
    RETURN;
  END IF;

  IF _last_at IS NOT NULL AND _event_created_at IS NOT NULL AND _event_created_at < _last_at THEN
    RETURN QUERY SELECT false, 'stale_event';
    RETURN;
  END IF;

  UPDATE public.subscriptions s
    SET
      plan = COALESCE((_updates->>'plan')::subscription_plan, s.plan),
      status = COALESCE(_updates->>'status', s.status),
      account_status = COALESCE(_updates->>'account_status', s.account_status),
      stripe_customer_id = COALESCE(_updates->>'stripe_customer_id', s.stripe_customer_id),
      stripe_subscription_id = COALESCE(_updates->>'stripe_subscription_id', s.stripe_subscription_id),
      search_credits_base = COALESCE((_updates->>'search_credits_base')::int, s.search_credits_base),
      search_credits_remaining = COALESCE((_updates->>'search_credits_remaining')::int, s.search_credits_remaining),
      leads_limit = COALESCE((_updates->>'leads_limit')::int, s.leads_limit),
      daily_searches_used = COALESCE((_updates->>'daily_searches_used')::int, s.daily_searches_used),
      current_period_start = COALESCE((_updates->>'current_period_start')::timestamptz, s.current_period_start),
      current_period_end = COALESCE((_updates->>'current_period_end')::timestamptz, s.current_period_end),
      credits_reset_at = COALESCE((_updates->>'credits_reset_at')::timestamptz, s.credits_reset_at),
      last_stripe_event_id = _event_id,
      last_stripe_event_at = COALESCE(_event_created_at, now()),
      updated_at = now()
    WHERE s.user_id = _user_id;

  RETURN QUERY SELECT true, 'applied';
END;
$$;
