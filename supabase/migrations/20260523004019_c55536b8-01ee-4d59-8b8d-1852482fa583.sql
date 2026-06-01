
-- 1. Explicit deny UPDATE on subscriptions for authenticated users
CREATE POLICY "Prevent subscription updates by users"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

-- 2. Revoke direct SELECT on sensitive columns from client roles.
-- Service role (used by edge functions) bypasses these grants.
REVOKE SELECT (secret) ON public.webhooks FROM authenticated, anon;
REVOKE SELECT (config) ON public.integrations FROM authenticated, anon;
