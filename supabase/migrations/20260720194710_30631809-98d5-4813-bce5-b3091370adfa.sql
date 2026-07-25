
-- Raise free tier allowance from 10 → 100 to allow real stress-testing of the platform

-- 1. New user provisioning trigger grants 100 credits
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.subscriptions (
    user_id, plan, status, account_status,
    leads_limit, search_credits_base, search_credits_remaining,
    credits_reset_at
  )
  VALUES (
    NEW.id, 'free', 'active', 'free',
    100, 100, 100,
    public.next_month_start_utc()
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 2. get_user_plan returns leads_limit 100 for free
CREATE OR REPLACE FUNCTION public.get_user_plan()
RETURNS TABLE(plan subscription_plan, has_automations boolean, has_ai_coach boolean,
              has_analytics boolean, has_api_access boolean, leads_limit integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_plan subscription_plan;
BEGIN
  SELECT s.plan INTO user_plan FROM subscriptions s
    WHERE s.user_id = auth.uid() AND s.status = 'active';
  IF user_plan IS NULL THEN user_plan := 'free'; END IF;
  IF user_plan = 'elite' THEN user_plan := 'pro'; END IF;
  RETURN QUERY SELECT
    user_plan,
    user_plan IN ('pro','agency'),
    user_plan IN ('starter','growth','pro','agency'),
    user_plan IN ('starter','growth','pro','agency'),
    user_plan IN ('pro','agency'),
    CASE
      WHEN user_plan='free' THEN 100
      WHEN user_plan='starter' THEN 1000
      WHEN user_plan='growth' THEN 2500
      WHEN user_plan='pro' THEN 5000
      WHEN user_plan='agency' THEN 15000
      ELSE 100
    END;
END; $$;

-- 3. Free tier monthly email cap = 100
CREATE OR REPLACE FUNCTION public.get_monthly_email_limit(_plan subscription_plan)
 RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _plan = 'free' THEN 100
    WHEN _plan = 'starter' THEN 50000
    WHEN _plan = 'growth' THEN 250000
    WHEN _plan IN ('pro','elite') THEN 1000000
    WHEN _plan = 'agency' THEN -1
    ELSE 100
  END;
$function$;

-- 4. Free tier daily search limit = 100 in deduct_search_credits
CREATE OR REPLACE FUNCTION public.deduct_search_credits(_amount integer, _description text DEFAULT 'Search query'::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid; _remaining integer; _daily_used integer;
  _daily_limit integer; _plan text;
  _new_remaining integer; _new_daily_used integer;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF _amount < 1 OR _amount > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT search_credits_remaining, daily_searches_used, daily_email_limit, plan
  INTO _remaining, _daily_used, _daily_limit, _plan
  FROM subscriptions WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No subscription found');
  END IF;

  IF _remaining < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient search credits. Upgrade your plan for more.');
  END IF;

  _daily_limit := CASE
    WHEN _plan = 'free' THEN 100
    WHEN _plan = 'starter' THEN 100
    WHEN _plan = 'growth' THEN 250
    WHEN _plan = 'pro' THEN 500
    WHEN _plan = 'agency' THEN 1500
    ELSE 100
  END;

  IF _daily_used >= _daily_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Daily search limit reached');
  END IF;

  _new_remaining := _remaining - _amount;
  _new_daily_used := _daily_used + 1;

  UPDATE subscriptions
  SET search_credits_remaining = _new_remaining,
      daily_searches_used = _new_daily_used,
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO search_transactions (user_id, type, amount, balance_after, description)
  VALUES (_user_id, 'usage', -_amount, _new_remaining, _description);

  RETURN jsonb_build_object('success', true, 'remaining', _new_remaining, 'daily_used', _new_daily_used);
END;
$function$;

-- 5. Backfill existing free users to the new allowance (top up if below 100)
UPDATE public.subscriptions
SET
  leads_limit = GREATEST(COALESCE(leads_limit, 0), 100),
  search_credits_base = GREATEST(COALESCE(search_credits_base, 0), 100),
  search_credits_remaining = GREATEST(COALESCE(search_credits_remaining, 0), 100),
  daily_email_limit = GREATEST(COALESCE(daily_email_limit, 0), 100),
  updated_at = now()
WHERE plan = 'free';
