CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
 RETURNS TABLE(user_id uuid, email text, full_name text, plan subscription_plan, status text, account_status text, leads_limit integer, stripe_customer_id text, current_period_end timestamp with time zone, trial_end_date timestamp with time zone)
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
    p.id as user_id,
    p.email,
    p.full_name,
    COALESCE(s.plan, 'free'::subscription_plan) as plan,
    COALESCE(s.status, 'inactive') as status,
    COALESCE(s.account_status, 'active') as account_status,
    COALESCE(s.leads_limit, 0) as leads_limit,
    s.stripe_customer_id,
    COALESCE(s.current_period_end, now() + interval '1 month') as current_period_end,
    s.trial_end_date
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$function$;