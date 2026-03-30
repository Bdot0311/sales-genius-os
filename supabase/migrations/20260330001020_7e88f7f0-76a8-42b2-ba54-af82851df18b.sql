
DROP POLICY IF EXISTS "Users can create own audit logs" ON public.audit_logs;

CREATE POLICY "Service role can insert audit logs"
ON public.audit_logs
FOR INSERT
TO public
WITH CHECK (auth.role() = 'service_role');
