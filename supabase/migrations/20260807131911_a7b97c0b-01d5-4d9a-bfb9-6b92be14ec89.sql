CREATE OR REPLACE FUNCTION public.record_user_login(
  p_user_id uuid,
  p_user_email text DEFAULT NULL,
  p_login_method text DEFAULT 'password'::text,
  p_ip_address text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text,
  p_status text DEFAULT 'success'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Callers acting as an end user may only log their own sign-in events.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN;
  END IF;

  INSERT INTO public.login_history (user_id, login_method, ip_address, user_agent, status)
  VALUES (p_user_id, p_login_method, p_ip_address, p_user_agent, p_status);

  IF p_status = 'success' THEN
    UPDATE public.profiles SET last_sign_in_at = now() WHERE id = p_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_user_login(uuid, text, text, text, text, text) TO authenticated;
