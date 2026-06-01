
-- 1. Update new-user provisioning trigger to grant 10 search credits on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _existing_id uuid;
  _inserted_id uuid;
BEGIN
  INSERT INTO public.signup_diagnostics (user_id, email, stage, status, message, source)
  VALUES (NEW.id, NEW.email, 'trigger_start', 'info', 'handle_new_user_subscription invoked', 'db_trigger');

  SELECT id INTO _existing_id FROM public.subscriptions WHERE user_id = NEW.id LIMIT 1;
  IF _existing_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.subscriptions (
      user_id, plan, status, account_status,
      leads_limit, search_credits_base, search_credits_remaining, daily_searches_used,
      daily_email_limit,
      current_period_start, current_period_end, credits_reset_at
    )
    VALUES (
      NEW.id, 'free', 'active', 'active',
      10, 10, 10, 0,
      10,
      now(), public.next_month_start_utc(), public.next_month_start_utc()
    )
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO _inserted_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user_subscription failed for user %: % (%).', NEW.id, SQLERRM, SQLSTATE;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;

-- 2. Free tier in get_user_plan returns leads_limit 10 instead of 0
CREATE OR REPLACE FUNCTION public.get_user_plan()
 RETURNS TABLE(plan subscription_plan, has_automations boolean, has_ai_coach boolean, has_analytics boolean, has_api_access boolean, leads_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_plan subscription_plan;
BEGIN
  SELECT s.plan INTO user_plan
  FROM subscriptions s
  WHERE s.user_id = auth.uid()
  AND s.status = 'active';
  
  IF user_plan IS NULL THEN
    user_plan := 'free';
  END IF;

  IF user_plan = 'elite' THEN
    user_plan := 'pro';
  END IF;
  
  RETURN QUERY
  SELECT 
    user_plan,
    user_plan IN ('pro', 'agency') AS has_automations,
    user_plan IN ('starter', 'growth', 'pro', 'agency') AS has_ai_coach,
    user_plan IN ('starter', 'growth', 'pro', 'agency') AS has_analytics,
    user_plan IN ('pro', 'agency') AS has_api_access,
    CASE 
      WHEN user_plan = 'free' THEN 10
      WHEN user_plan = 'starter' THEN 1000
      WHEN user_plan = 'growth' THEN 2500
      WHEN user_plan = 'pro' THEN 5000
      WHEN user_plan = 'agency' THEN 15000
      ELSE 10
    END AS leads_limit;
END;
$function$;

-- 3. Free tier monthly email cap = 10
CREATE OR REPLACE FUNCTION public.get_monthly_email_limit(_plan subscription_plan)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _plan = 'free' THEN 10
    WHEN _plan = 'starter' THEN 50000
    WHEN _plan = 'growth' THEN 250000
    WHEN _plan IN ('pro','elite') THEN 1000000
    WHEN _plan = 'agency' THEN -1
    ELSE 10
  END;
$function$;

-- 4. Free tier daily search limit raised from 5 to 10 in deduct_search_credits
CREATE OR REPLACE FUNCTION public.deduct_search_credits(_amount integer, _description text DEFAULT 'Search query'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _remaining integer;
  _daily_used integer;
  _daily_limit integer;
  _plan text;
  _new_remaining integer;
  _new_daily_used integer;
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
  FROM subscriptions
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No subscription found');
  END IF;

  IF _remaining < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient search credits. Upgrade your plan for more.');
  END IF;

  _daily_limit := CASE
    WHEN _plan = 'free' THEN 10
    WHEN _plan = 'starter' THEN 100
    WHEN _plan = 'growth' THEN 250
    WHEN _plan = 'pro' THEN 500
    WHEN _plan = 'agency' THEN 1500
    ELSE 10
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

  RETURN jsonb_build_object(
    'success', true,
    'remaining', _new_remaining,
    'daily_used', _new_daily_used
  );
END;
$function$;

-- 5. Backfill existing free users that were provisioned with 0 credits
UPDATE public.subscriptions
SET 
  leads_limit = 10,
  search_credits_base = GREATEST(search_credits_base, 10),
  search_credits_remaining = GREATEST(search_credits_remaining, 10),
  daily_email_limit = GREATEST(COALESCE(daily_email_limit, 0), 10),
  credits_reset_at = COALESCE(credits_reset_at, public.next_month_start_utc()),
  updated_at = now()
WHERE plan = 'free'
  AND (leads_limit = 0 OR search_credits_base = 0 OR search_credits_remaining = 0);
