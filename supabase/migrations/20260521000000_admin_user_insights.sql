-- Add last_sign_in_at to profiles so admin can see when users were last active
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ DEFAULT NULL;

-- Update record_user_login to also stamp last_sign_in_at on success
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
    UPDATE public.profiles
    SET last_sign_in_at = now()
    WHERE id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_login TO authenticated;

-- Admin SELECT policy for profiles (so admin can see all user rows)
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
END
$$;

-- Recreate admin_get_all_subscriptions with created_at and last_sign_in_at
DROP FUNCTION IF EXISTS public.admin_get_all_subscriptions();

CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE(
  user_id              uuid,
  email                text,
  full_name            text,
  plan                 subscription_plan,
  status               text,
  account_status       text,
  leads_limit          integer,
  stripe_customer_id   text,
  current_period_end   timestamp with time zone,
  trial_end_date       timestamp with time zone,
  signup_source        text,
  created_at           timestamp with time zone,
  last_sign_in_at      timestamp with time zone
)
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
    p.id                                                AS user_id,
    p.email,
    p.full_name,
    COALESCE(s.plan, 'free'::subscription_plan)         AS plan,
    COALESCE(s.status, 'inactive')                      AS status,
    COALESCE(s.account_status, 'active')                AS account_status,
    COALESCE(s.leads_limit, 0)                          AS leads_limit,
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
