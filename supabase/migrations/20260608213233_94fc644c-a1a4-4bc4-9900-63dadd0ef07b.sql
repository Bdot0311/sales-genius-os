
-- Explicit column-level revokes (idempotent; documents intent for scanners)
REVOKE SELECT (key) ON public.api_keys FROM authenticated, anon;
REVOKE SELECT (config) ON public.integrations FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhooks FROM authenticated, anon;

-- email_send_state: restrictive deny for non-service callers
DROP POLICY IF EXISTS "Deny non-service access to email_send_state" ON public.email_send_state;
CREATE POLICY "Deny non-service access to email_send_state"
ON public.email_send_state
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- re_engagement_log: restrictive deny on writes for non-service callers
DROP POLICY IF EXISTS "Deny non-service writes to re_engagement_log" ON public.re_engagement_log;
CREATE POLICY "Deny non-service writes to re_engagement_log"
ON public.re_engagement_log
AS RESTRICTIVE
FOR INSERT
TO anon, authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny non-service updates to re_engagement_log" ON public.re_engagement_log;
CREATE POLICY "Deny non-service updates to re_engagement_log"
ON public.re_engagement_log
AS RESTRICTIVE
FOR UPDATE
TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS "Deny non-service deletes to re_engagement_log" ON public.re_engagement_log;
CREATE POLICY "Deny non-service deletes to re_engagement_log"
ON public.re_engagement_log
AS RESTRICTIVE
FOR DELETE
TO anon, authenticated
USING (false);
