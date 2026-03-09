
-- Update get_user_plan to remove elite references
CREATE OR REPLACE FUNCTION public.get_user_plan()
 RETURNS TABLE(plan subscription_plan, has_automations boolean, has_ai_coach boolean, has_analytics boolean, has_api_access boolean, leads_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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

  -- Map legacy elite to pro
  IF user_plan = 'elite' THEN
    user_plan := 'pro';
  END IF;
  
  RETURN QUERY
  SELECT 
    user_plan,
    user_plan IN ('pro') AS has_automations,
    user_plan IN ('starter', 'growth', 'pro') AS has_ai_coach,
    user_plan IN ('starter', 'growth', 'pro') AS has_analytics,
    user_plan IN ('pro') AS has_api_access,
    CASE 
      WHEN user_plan = 'free' THEN 0
      WHEN user_plan = 'starter' THEN 400
      WHEN user_plan = 'growth' THEN 1200
      WHEN user_plan = 'pro' THEN 3000
      ELSE 0
    END AS leads_limit;
END;
$$;

-- Update admin dashboard stats to remove elite
CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
 RETURNS TABLE(total_users bigint, active_trials bigint, locked_accounts bigint, active_subscriptions bigint, total_revenue numeric, monthly_revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
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
          ELSE 0 
        END
      ELSE 0 
    END)::numeric, 0) as monthly_revenue
  FROM subscriptions s;
END;
$$;

-- Update admin_update_subscription to remove elite
CREATE OR REPLACE FUNCTION public.admin_update_subscription(_user_id uuid, _plan subscription_plan, _status text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _leads_limit INTEGER;
  _credits INTEGER;
  _effective_plan subscription_plan;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Map elite to pro
  _effective_plan := CASE WHEN _plan = 'elite' THEN 'pro'::subscription_plan ELSE _plan END;

  _leads_limit := CASE 
    WHEN _effective_plan = 'free' THEN 0
    WHEN _effective_plan = 'starter' THEN 400
    WHEN _effective_plan = 'growth' THEN 1200
    WHEN _effective_plan = 'pro' THEN 3000
    ELSE 0
  END;

  _credits := CASE
    WHEN _effective_plan = 'free' THEN 0
    WHEN _effective_plan = 'starter' THEN 400
    WHEN _effective_plan = 'growth' THEN 1200
    WHEN _effective_plan = 'pro' THEN 3000
    ELSE 0
  END;

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
$$;

-- Migrate any existing elite subscriptions to pro
UPDATE subscriptions SET plan = 'pro' WHERE plan = 'elite';
