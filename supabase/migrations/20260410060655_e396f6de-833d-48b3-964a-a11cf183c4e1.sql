
-- Update get_user_plan to reflect new tier limits including agency
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
      WHEN user_plan = 'free' THEN 0
      WHEN user_plan = 'starter' THEN 1000
      WHEN user_plan = 'growth' THEN 2500
      WHEN user_plan = 'pro' THEN 5000
      WHEN user_plan = 'agency' THEN 15000
      ELSE 0
    END AS leads_limit;
END;
$function$;

-- Update admin_update_subscription to reflect new tier limits including agency
CREATE OR REPLACE FUNCTION public.admin_update_subscription(_user_id uuid, _plan subscription_plan, _status text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _leads_limit INTEGER;
  _credits INTEGER;
  _effective_plan subscription_plan;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  _effective_plan := CASE WHEN _plan = 'elite' THEN 'pro'::subscription_plan ELSE _plan END;

  _leads_limit := CASE 
    WHEN _effective_plan = 'free' THEN 0
    WHEN _effective_plan = 'starter' THEN 1000
    WHEN _effective_plan = 'growth' THEN 2500
    WHEN _effective_plan = 'pro' THEN 5000
    WHEN _effective_plan = 'agency' THEN 15000
    ELSE 0
  END;

  _credits := _leads_limit;

  UPDATE subscriptions
  SET 
    plan = _effective_plan,
    leads_limit = _leads_limit,
    search_credits_base = _credits,
    search_credits_remaining = _credits,
    status = COALESCE(_status, status),
    updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'update_subscription',
    'user',
    _user_id,
    jsonb_build_object('new_plan', _effective_plan::text, 'leads_limit', _leads_limit, 'credits', _credits)
  );
END;
$function$;

-- Update admin_get_dashboard_stats to include agency pricing
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
 RETURNS TABLE(total_users bigint, active_trials bigint, locked_accounts bigint, active_subscriptions bigint, total_revenue numeric, monthly_revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    COUNT(DISTINCT s.user_id)::bigint as total_users,
    COUNT(DISTINCT CASE WHEN s.account_status = 'trial' THEN s.user_id END)::bigint as active_trials,
    COUNT(DISTINCT CASE WHEN s.account_status = 'locked' THEN s.user_id END)::bigint as locked_accounts,
    COUNT(DISTINCT CASE WHEN s.status = 'active' AND s.stripe_subscription_id IS NOT NULL THEN s.user_id END)::bigint as active_subscriptions,
    COALESCE(SUM(CASE 
      WHEN s.stripe_subscription_id IS NOT NULL THEN
        CASE 
          WHEN s.plan = 'starter' THEN 39
          WHEN s.plan = 'growth' THEN 89
          WHEN s.plan IN ('pro', 'elite') THEN 179
          WHEN s.plan = 'agency' THEN 249
          ELSE 0 
        END
      ELSE 0 
    END)::numeric, 0) as total_revenue,
    COALESCE(SUM(CASE 
      WHEN s.status = 'active' AND s.stripe_subscription_id IS NOT NULL AND s.current_period_end > now() THEN
        CASE 
          WHEN s.plan = 'starter' THEN 39
          WHEN s.plan = 'growth' THEN 89
          WHEN s.plan IN ('pro', 'elite') THEN 179
          WHEN s.plan = 'agency' THEN 249
          ELSE 0 
        END
      ELSE 0 
    END)::numeric, 0) as monthly_revenue
  FROM subscriptions s;
END;
$function$;

-- Update deduct_search_credits daily limits
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
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient search credits');
  END IF;

  _daily_limit := CASE
    WHEN _plan = 'free' THEN 5
    WHEN _plan = 'starter' THEN 50
    WHEN _plan = 'growth' THEN 100
    WHEN _plan = 'pro' THEN 250
    WHEN _plan = 'agency' THEN 500
    ELSE 5
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

-- Update existing subscribers to new credit amounts
UPDATE public.subscriptions 
SET search_credits_base = 5000,
    search_credits_remaining = GREATEST(search_credits_remaining, 5000),
    leads_limit = 5000
WHERE plan = 'pro' AND search_credits_base < 5000;

UPDATE public.subscriptions 
SET search_credits_base = 2500,
    search_credits_remaining = GREATEST(search_credits_remaining, 2500),
    leads_limit = 2500
WHERE plan = 'growth' AND search_credits_base < 2500;

UPDATE public.subscriptions 
SET search_credits_base = 1000,
    search_credits_remaining = GREATEST(search_credits_remaining, 1000),
    leads_limit = 1000
WHERE plan = 'starter' AND search_credits_base < 1000;
