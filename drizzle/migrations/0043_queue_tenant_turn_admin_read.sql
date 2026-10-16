GRANT SELECT ON public.queue_tenant_turn TO authenticated;
GRANT ALL ON public.queue_tenant_turn TO service_role;
DROP POLICY IF EXISTS "Admins can read queue turns" ON public.queue_tenant_turn;
CREATE POLICY "Admins can read queue turns" ON public.queue_tenant_turn
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));