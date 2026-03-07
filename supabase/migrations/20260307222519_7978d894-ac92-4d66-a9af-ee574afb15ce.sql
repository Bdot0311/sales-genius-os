
-- Step 1: Add 'free' to subscription_plan enum
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'free' BEFORE 'growth';

-- Step 2: Update handle_new_user_subscription() to default new users to 'free' with 0 credits
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, leads_limit, search_credits_base, search_credits_remaining)
  VALUES (NEW.id, 'free', 0, 0, 0);
  RETURN NEW;
END;
$function$;

-- Step 3: Update get_user_plan() to handle free tier
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
  
  RETURN QUERY
  SELECT 
    user_plan,
    user_plan IN ('pro', 'elite') AS has_automations,
    user_plan IN ('growth', 'pro', 'elite') AS has_ai_coach,
    user_plan IN ('growth', 'pro', 'elite') AS has_analytics,
    user_plan = 'elite' AS has_api_access,
    CASE 
      WHEN user_plan = 'free' THEN 0
      WHEN user_plan = 'growth' THEN 1000
      WHEN user_plan = 'pro' THEN 10000
      ELSE 999999
    END AS leads_limit;
END;
$function$;

-- Step 4: Update get_user_leads_usage() to handle free plan
CREATE OR REPLACE FUNCTION public.get_user_leads_usage()
RETURNS TABLE(leads_count bigint, leads_limit integer, plan subscription_plan)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(l.id)::BIGINT as leads_count,
    s.leads_limit,
    s.plan
  FROM subscriptions s
  LEFT JOIN leads l ON l.user_id = s.user_id
  WHERE s.user_id = auth.uid()
  AND s.status = 'active'
  GROUP BY s.leads_limit, s.plan;
END;
$function$;

-- Step 5: Update admin_update_subscription() with new pricing and free plan
CREATE OR REPLACE FUNCTION public.admin_update_subscription(_user_id uuid, _plan subscription_plan, _status text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _leads_limit INTEGER;
  _credits INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  _leads_limit := CASE 
    WHEN _plan = 'free' THEN 0
    WHEN _plan = 'growth' THEN 1000
    WHEN _plan = 'pro' THEN 10000
    ELSE 999999
  END;

  _credits := CASE
    WHEN _plan = 'free' THEN 0
    WHEN _plan = 'growth' THEN 150
    WHEN _plan = 'pro' THEN 500
    ELSE 1500
  END;

  UPDATE subscriptions
  SET 
    plan = _plan,
    leads_limit = _leads_limit,
    search_credits_base = _credits,
    search_credits_remaining = _credits,
    status = COALESCE(_status, status),
    updated_at = now()
  WHERE user_id = _user_id;
END;
$function$;

-- Step 6: Update admin_get_dashboard_stats() with new revenue prices
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
          WHEN s.plan = 'growth' THEN 49
          WHEN s.plan = 'pro' THEN 149
          WHEN s.plan = 'elite' THEN 399
          ELSE 0 
        END
      ELSE 0 
    END)::numeric, 0) as total_revenue,
    COALESCE(SUM(CASE 
      WHEN s.status = 'active' AND s.stripe_subscription_id IS NOT NULL AND s.current_period_end > now() THEN
        CASE 
          WHEN s.plan = 'growth' THEN 49
          WHEN s.plan = 'pro' THEN 149
          WHEN s.plan = 'elite' THEN 399
          ELSE 0 
        END
      ELSE 0 
    END)::numeric, 0) as monthly_revenue
  FROM subscriptions s;
END;
$function$;
