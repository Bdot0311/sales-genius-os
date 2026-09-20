-- Secret-bearing columns must never be reachable from a browser client.
-- Reads were already limited to non-secret columns; this migration also removes
-- the residual table-wide INSERT/UPDATE grants (which let a client overwrite
-- api_keys.key, integrations.config or webhooks.secret) and strips anonymous
-- write access entirely. Service-role (edge functions) keeps full access.

REVOKE ALL ON public.api_keys FROM anon;
REVOKE ALL ON public.integrations FROM anon;
REVOKE ALL ON public.webhooks FROM anon;

-- api_keys: keys are minted and rotated by edge functions only.
REVOKE INSERT, UPDATE, SELECT ON public.api_keys FROM authenticated;
GRANT SELECT (
  id, user_id, name, prefix, created_at, last_used_at, expires_at, is_active,
  rate_limit_per_minute, rate_limit_per_day, rotation_policy_days,
  endpoint_rate_limits, enable_caching, cache_ttl_seconds,
  total_requests, last_request_at, rotation_reminder_sent
) ON public.api_keys TO authenticated;
GRANT DELETE ON public.api_keys TO authenticated;

-- integrations: OAuth tokens live in config; clients read metadata only and all
-- connection writes go through the OAuth callback functions.
REVOKE INSERT, UPDATE, SELECT ON public.integrations FROM authenticated;
GRANT SELECT (
  id, user_id, integration_id, integration_name, is_active,
  connected_email, created_at, updated_at
) ON public.integrations TO authenticated;
GRANT DELETE ON public.integrations TO authenticated;

-- webhooks: the signing secret may be written once at creation but never read
-- back or overwritten from the client.
REVOKE INSERT, UPDATE, SELECT ON public.webhooks FROM authenticated;
GRANT SELECT (
  id, user_id, name, url, events, direction, endpoint_token, default_source,
  is_active, created_at, last_triggered_at, last_received_at,
  total_triggers, total_received
) ON public.webhooks TO authenticated;
GRANT INSERT (
  user_id, name, url, events, direction, endpoint_token, default_source,
  is_active, secret
) ON public.webhooks TO authenticated;
GRANT UPDATE (name, url, events, default_source, is_active) ON public.webhooks TO authenticated;
GRANT DELETE ON public.webhooks TO authenticated;

GRANT ALL ON public.api_keys TO service_role;
GRANT ALL ON public.integrations TO service_role;
GRANT ALL ON public.webhooks TO service_role;

-- Scope the integrations policies to signed-in users instead of every role.
DROP POLICY IF EXISTS "Users can view own integrations" ON public.integrations;
DROP POLICY IF EXISTS "Users can create own integrations" ON public.integrations;
DROP POLICY IF EXISTS "Users can update own integrations" ON public.integrations;
DROP POLICY IF EXISTS "Users can delete own integrations" ON public.integrations;

CREATE POLICY "Users can view own integrations"
  ON public.integrations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own integrations"
  ON public.integrations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations"
  ON public.integrations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations"
  ON public.integrations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
