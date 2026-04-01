-- Function to get admin dashboard stats
CREATE OR REPLACE FUNCTION admin_get_dashboard_stats()
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
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    COUNT(DISTINCT s.user_id) as total_users,
    COUNT(DISTINCT CASE WHEN s.account_status = 'trial' THEN s.user_id END) as active_trials,
    COUNT(DISTINCT CASE WHEN s.account_status = 'locked' THEN s.user_id END) as locked_accounts,
    COUNT(DISTINCT CASE WHEN s.status = 'active' AND s.account_status = 'active' THEN s.user_id END) as active_subscriptions,
    SUM(CASE 
      WHEN s.plan = 'growth' THEN 49
      WHEN s.plan = 'pro' THEN 199
      WHEN s.plan = 'elite' THEN 499
      ELSE 0 
    END) as total_revenue,
    SUM(CASE 
      WHEN s.status = 'active' AND s.current_period_end > now() THEN
        CASE 
          WHEN s.plan = 'growth' THEN 49
          WHEN s.plan = 'pro' THEN 199
          WHEN s.plan = 'elite' THEN 499
          ELSE 0 
        END
      ELSE 0 
    END) as monthly_revenue
  FROM subscriptions s;
END;
$$;

-- Function to get users with expiring trials
CREATE OR REPLACE FUNCTION get_expiring_trials(_days_until_expiry integer)
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  trial_end_date timestamp with time zone,
  days_remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.user_id,
    p.email,
    p.full_name,
    s.trial_end_date,
    CEIL(EXTRACT(EPOCH FROM (s.trial_end_date - now())) / 86400)::integer as days_remaining
  FROM subscriptions s
  JOIN profiles p ON p.id = s.user_id
  WHERE s.account_status = 'trial'
  AND s.trial_end_date IS NOT NULL
  AND s.trial_end_date > now()
  AND s.trial_end_date <= now() + (_days_until_expiry || ' days')::interval
  AND s.trial_end_date >= now() + ((_days_until_expiry - 1) || ' days')::interval;
END;
$$;

-- Add a field to track when trial warning emails were sent
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS trial_warning_7d_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS trial_warning_3d_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS trial_warning_1d_sent boolean DEFAULT false;