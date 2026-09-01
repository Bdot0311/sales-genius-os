-- 1) api_keys: remove column-level read access to the secret key value
REVOKE SELECT ON public.api_keys FROM authenticated, anon;

GRANT SELECT (
  id, user_id, name, prefix, created_at, last_used_at, is_active,
  rate_limit_per_minute, rate_limit_per_day, total_requests, last_request_at,
  expires_at, rotation_reminder_sent, rotation_policy_days,
  endpoint_rate_limits, enable_caching, cache_ttl_seconds
) ON public.api_keys TO authenticated;

GRANT ALL ON public.api_keys TO service_role;

-- 2) integrations: remove column-level read access to credential config
REVOKE SELECT ON public.integrations FROM authenticated, anon;

GRANT SELECT (
  id, user_id, integration_id, integration_name, is_active,
  created_at, updated_at, connected_email
) ON public.integrations TO authenticated;

GRANT ALL ON public.integrations TO service_role;
