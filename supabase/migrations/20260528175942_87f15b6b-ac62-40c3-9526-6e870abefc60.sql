REVOKE SELECT (config) ON public.integrations FROM authenticated;
REVOKE SELECT (config) ON public.integrations FROM anon;

REVOKE SELECT (secret) ON public.webhooks FROM authenticated;
REVOKE SELECT (secret) ON public.webhooks FROM anon;

GRANT SELECT (
  id, user_id, integration_id, integration_name, connected_email,
  is_active, created_at, updated_at
) ON public.integrations TO authenticated;

GRANT SELECT (
  id, user_id, name, url, events, is_active,
  created_at, last_triggered_at, total_triggers
) ON public.webhooks TO authenticated;

GRANT ALL ON public.integrations TO service_role;
GRANT ALL ON public.webhooks TO service_role;