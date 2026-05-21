
-- 1. Admin policy on audit_logs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='Admins can view all audit logs'
  ) THEN
    CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- 2. Add last_sign_in_at to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;

-- 3. Admin policy on profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles" ON public.profiles
      FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

-- 4. record_user_login function
CREATE OR REPLACE FUNCTION public.record_user_login(
  p_user_id uuid,
  p_user_email text,
  p_login_method text DEFAULT 'password',
  p_status text DEFAULT 'success'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles SET last_sign_in_at = now() WHERE id = p_user_id;

  BEGIN
    INSERT INTO public.login_history (user_id, user_email, login_method, status, created_at)
    VALUES (p_user_id, p_user_email, p_login_method, p_status, now());
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END;
$$;

-- 5. Recreate admin_get_all_subscriptions with created_at + last_sign_in_at
DROP FUNCTION IF EXISTS public.admin_get_all_subscriptions();
CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE(
  user_id uuid, email text, full_name text, plan subscription_plan, status text,
  account_status text, leads_limit integer, stripe_customer_id text,
  current_period_end timestamptz, trial_end_date timestamptz, signup_source text,
  created_at timestamptz, last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.email,
    p.full_name,
    COALESCE(s.plan, 'free'::subscription_plan) AS plan,
    COALESCE(s.status, 'inactive') AS status,
    COALESCE(s.account_status, 'active') AS account_status,
    COALESCE(s.leads_limit, 0) AS leads_limit,
    s.stripe_customer_id,
    COALESCE(s.current_period_end, now() + interval '1 month') AS current_period_end,
    s.trial_end_date,
    p.signup_source,
    p.created_at,
    p.last_sign_in_at
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;
