-- Defense-in-depth: prevent client (authenticated role) from reading sensitive columns
-- via PostgREST. Service role (edge functions) retains full access.

REVOKE SELECT (secret) ON public.webhooks FROM authenticated, anon;
REVOKE SELECT (config) ON public.integrations FROM authenticated, anon;

-- Re-grant safe columns explicitly to authenticated (RLS still enforces row-level ownership)
GRANT SELECT (id, user_id, name, url, events, is_active, created_at, last_triggered_at, total_triggers)
  ON public.webhooks TO authenticated;

GRANT SELECT (id, user_id, integration_id, integration_name, connected_email, is_active, created_at, updated_at)
  ON public.integrations TO authenticated;