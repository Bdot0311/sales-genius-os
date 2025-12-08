CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
 RETURNS TABLE(total_users bigint, active_trials bigint, locked_accounts bigint, active_subscriptions bigint, total_revenue numeric, monthly_revenue numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    COUNT(DISTINCT s.user_id)::bigint as total_users,
    COUNT(DISTINCT CASE WHEN s.account_status = 'trial' THEN s.user_id END)::bigint as active_trials,
    COUNT(DISTINCT CASE WHEN s.account_status = 'locked' THEN s.user_id END)::bigint as locked_accounts,
    COUNT(DISTINCT CASE WHEN s.status = 'active' AND s.account_status = 'active' THEN s.user_id END)::bigint as active_subscriptions,
    COALESCE(SUM(CASE 
      WHEN s.plan = 'growth' THEN 49
      WHEN s.plan = 'pro' THEN 199
      WHEN s.plan = 'elite' THEN 499
      ELSE 0 
    END)::numeric, 0) as total_revenue,
    COALESCE(SUM(CASE 
      WHEN s.status = 'active' AND s.current_period_end > now() THEN
        CASE 
          WHEN s.plan = 'growth' THEN 49
          WHEN s.plan = 'pro' THEN 199
          WHEN s.plan = 'elite' THEN 499
          ELSE 0 
        END
      ELSE 0 
    END)::numeric, 0) as monthly_revenue
  FROM subscriptions s;
END;
$function$;