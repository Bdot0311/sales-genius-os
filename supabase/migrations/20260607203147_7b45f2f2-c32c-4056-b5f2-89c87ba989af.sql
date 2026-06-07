
DROP POLICY IF EXISTS "Deny all access to email_send_log" ON public.email_send_log;

-- Restrictive policy: block anon entirely, and block authenticated unless admin
CREATE POLICY "Restrict email_send_log to admins"
  ON public.email_send_log
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (
    auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    auth.role() = 'service_role' OR public.has_role(auth.uid(), 'admin'::app_role)
  );

GRANT SELECT ON public.email_send_log TO authenticated;
