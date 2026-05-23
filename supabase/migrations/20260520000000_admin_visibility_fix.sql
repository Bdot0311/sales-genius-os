-- Fix 1: Admin can now read ALL audit logs (not just their own)
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Fix 2: SECURITY DEFINER function so any authenticated user can record a login
-- (bypasses RLS so it always succeeds regardless of INSERT policies on the table)
CREATE OR REPLACE FUNCTION public.record_user_login(
  p_user_id    uuid,
  p_user_email text,
  p_login_method text  DEFAULT 'password',
  p_ip_address   text  DEFAULT NULL,
  p_user_agent   text  DEFAULT NULL,
  p_status       text  DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.login_history (user_id, user_email, login_method, ip_address, user_agent, status)
  VALUES (p_user_id, p_user_email, p_login_method, p_ip_address, p_user_agent, p_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_login TO authenticated;
