
CREATE OR REPLACE FUNCTION public.touch_last_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.profiles
    SET last_sign_in_at = now()
    WHERE id = auth.uid()
      AND (last_sign_in_at IS NULL OR last_sign_in_at < now() - interval '5 minutes');
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_last_active() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE(user_id uuid, email text, full_name text, plan subscription_plan, status text, account_status text, leads_limit integer, stripe_customer_id text, current_period_end timestamp with time zone, trial_end_date timestamp with time zone, signup_source text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.full_name,
    COALESCE(s.plan, 'free'::subscription_plan),
    COALESCE(s.status, 'inactive'),
    COALESCE(s.account_status, 'active'),
    COALESCE(s.leads_limit, 0),
    s.stripe_customer_id,
    COALESCE(s.current_period_end, now() + interval '1 month'),
    s.trial_end_date,
    p.signup_source,
    p.created_at,
    GREATEST(u.last_sign_in_at, p.last_sign_in_at) AS last_sign_in_at
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;
