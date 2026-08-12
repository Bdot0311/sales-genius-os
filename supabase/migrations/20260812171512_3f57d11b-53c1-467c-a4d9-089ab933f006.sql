DROP POLICY IF EXISTS "Authenticated users can read demo domains" ON public.demo_email_domains;

CREATE POLICY "Admins can read demo domains"
  ON public.demo_email_domains FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.demo_email_domains TO authenticated;
GRANT ALL ON public.demo_email_domains TO service_role;