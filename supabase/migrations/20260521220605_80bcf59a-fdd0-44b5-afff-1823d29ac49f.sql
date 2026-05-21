-- Drop all existing overloads of record_user_login to resolve ambiguity
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'record_user_login'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- === 20260521000000_admin_user_insights.sql ===
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.record_user_login(
  p_user_id      uuid,
  p_user_email   text,
  p_login_method text DEFAULT 'password',
  p_ip_address   text DEFAULT NULL,
  p_user_agent   text DEFAULT NULL,
  p_status       text DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_history (user_id, user_email, login_method, ip_address, user_agent, status)
  VALUES (p_user_id, p_user_email, p_login_method, p_ip_address, p_user_agent, p_status);

  IF p_status = 'success' THEN
    UPDATE public.profiles SET last_sign_in_at = now() WHERE id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_login TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.admin_get_all_subscriptions();

CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE(
  user_id uuid, email text, full_name text, plan subscription_plan,
  status text, account_status text, leads_limit integer,
  stripe_customer_id text, current_period_end timestamptz,
  trial_end_date timestamptz, signup_source text,
  created_at timestamptz, last_sign_in_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
    s.trial_end_date, p.signup_source, p.created_at, p.last_sign_in_at
  FROM profiles p
  LEFT JOIN subscriptions s ON s.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

-- === 20260521100000_canspam_compliance_columns.sql ===
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS physical_address TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS include_unsubscribe BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS include_compliance_footer BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS email_signature TEXT DEFAULT NULL;