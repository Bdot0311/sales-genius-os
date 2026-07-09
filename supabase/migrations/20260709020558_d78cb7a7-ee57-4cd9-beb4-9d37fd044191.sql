DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
-- The RESTRICTIVE "Deny non-service access to email_send_state" policy remains.
-- service_role bypasses RLS entirely, so it retains full access without an explicit permissive policy.