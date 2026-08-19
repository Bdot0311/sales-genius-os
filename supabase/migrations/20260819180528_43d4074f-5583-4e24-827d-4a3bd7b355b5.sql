-- Make email_send_log access explicitly admin/service-only (defence in depth)
REVOKE ALL ON public.email_send_log FROM anon, authenticated;
GRANT ALL ON public.email_send_log TO service_role;

DROP POLICY IF EXISTS "Admins can view email send logs" ON public.email_send_log;
CREATE POLICY "Admins can view email send logs"
ON public.email_send_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));