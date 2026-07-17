CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats()
RETURNS TABLE(
  total_users bigint,
  active_trials bigint,
  locked_accounts bigint,
  active_subscriptions bigint,
  total_revenue numeric,
  monthly_revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  WITH paid_active_subscriptions AS (
    SELECT s.*
    FROM public.subscriptions s
    WHERE s.status = 'active'
      AND s.account_status = 'active'
      AND s.plan <> 'free'
      AND s.stripe_subscription_id IS NOT NULL
      AND s.current_period_end > now()
  )
  SELECT
    COUNT(DISTINCT s.user_id)::bigint AS total_users,
    COUNT(DISTINCT CASE WHEN s.account_status = 'trial' THEN s.user_id END)::bigint AS active_trials,
    COUNT(DISTINCT CASE WHEN s.account_status = 'locked' THEN s.user_id END)::bigint AS locked_accounts,
    COUNT(DISTINCT p.user_id)::bigint AS active_subscriptions,
    COALESCE(SUM(CASE
      WHEN p.plan = 'starter' THEN 39
      WHEN p.plan = 'growth' THEN 89
      WHEN p.plan IN ('pro', 'elite') THEN 179
      WHEN p.plan = 'agency' THEN 249
      ELSE 0
    END)::numeric, 0) AS total_revenue,
    COALESCE(SUM(CASE
      WHEN p.plan = 'starter' THEN 39
      WHEN p.plan = 'growth' THEN 89
      WHEN p.plan IN ('pro', 'elite') THEN 179
      WHEN p.plan = 'agency' THEN 249
      ELSE 0
    END)::numeric, 0) AS monthly_revenue
  FROM public.subscriptions s
  LEFT JOIN paid_active_subscriptions p ON p.user_id = s.user_id;
END;
$function$;