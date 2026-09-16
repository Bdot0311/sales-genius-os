-- Keep secret material out of client-readable columns.
-- api_keys.key is only revealed once at creation/rotation by edge functions.
-- integrations.config holds OAuth tokens read only by edge functions.

REVOKE SELECT ON public.api_keys FROM authenticated;
GRANT SELECT (
  id, user_id, name, prefix, created_at, last_used_at, is_active,
  rate_limit_per_minute, rate_limit_per_day, total_requests, last_request_at,
  expires_at, rotation_reminder_sent, rotation_policy_days,
  endpoint_rate_limits, enable_caching, cache_ttl_seconds
) ON public.api_keys TO authenticated;

REVOKE SELECT ON public.integrations FROM authenticated;
GRANT SELECT (
  id, user_id, integration_id, integration_name, is_active, connected_email,
  created_at, updated_at
) ON public.integrations TO authenticated;

GRANT ALL ON public.api_keys TO service_role;
GRANT ALL ON public.integrations TO service_role;