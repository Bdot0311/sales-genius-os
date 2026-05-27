
-- 1. Restrict sensitive columns on integrations (config) and webhooks (secret)
REVOKE SELECT (config) ON public.integrations FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhooks FROM authenticated, anon;

-- Re-grant SELECT on safe columns explicitly for integrations
GRANT SELECT (id, user_id, integration_id, integration_name, connected_email, is_active, created_at, updated_at) ON public.integrations TO authenticated;

-- Re-grant SELECT on safe columns explicitly for webhooks
GRANT SELECT (id, user_id, name, url, events, is_active, created_at, last_triggered_at, total_triggers) ON public.webhooks TO authenticated;

-- 2. Defense-in-depth deny policies on email_unsubscribe_tokens for anon and authenticated
CREATE POLICY "Deny anon access to unsubscribe tokens"
  ON public.email_unsubscribe_tokens
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- 3. Remove sensitive tables from realtime publication to prevent cross-user leakage
ALTER PUBLICATION supabase_realtime DROP TABLE public.rate_limit_buckets;
ALTER PUBLICATION supabase_realtime DROP TABLE public.system_events;

-- 4. Lock down user_roles INSERT/UPDATE/DELETE to service_role only.
-- The handle_new_user_role trigger is SECURITY DEFINER and bypasses RLS,
-- so default 'user' role provisioning continues to work.
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Only service role can insert roles"
  ON public.user_roles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Only service role can update roles"
  ON public.user_roles
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Only service role can delete roles"
  ON public.user_roles
  FOR DELETE
  TO service_role
  USING (true);
