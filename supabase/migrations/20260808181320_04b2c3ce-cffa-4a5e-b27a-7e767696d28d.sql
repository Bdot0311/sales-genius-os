-- Restore Data API privileges lost by earlier REVOKEs (no re-grant was ever issued).
-- api_keys: column-level SELECT excludes the raw `key` column.
GRANT SELECT (
  id, user_id, name, prefix, created_at, last_used_at, is_active,
  rate_limit_per_minute, rate_limit_per_day, total_requests, last_request_at,
  expires_at, rotation_reminder_sent, rotation_policy_days,
  endpoint_rate_limits, enable_caching, cache_ttl_seconds
) ON public.api_keys TO authenticated;

GRANT UPDATE (
  name, is_active, rate_limit_per_minute, rate_limit_per_day,
  expires_at, rotation_policy_days, endpoint_rate_limits,
  enable_caching, cache_ttl_seconds
) ON public.api_keys TO authenticated;

GRANT DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;

-- webhooks: column-level SELECT excludes the raw `secret` column.
GRANT SELECT (
  id, user_id, name, url, events, is_active, created_at,
  last_triggered_at, total_triggers
) ON public.webhooks TO authenticated;

GRANT INSERT (user_id, name, url, events, secret, is_active) ON public.webhooks TO authenticated;
GRANT UPDATE (name, url, events, is_active) ON public.webhooks TO authenticated;
GRANT DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;

-- Masked-secret view used by the settings UI.
GRANT SELECT ON public.webhooks_safe TO authenticated;
GRANT ALL ON public.webhooks_safe TO service_role;

GRANT EXECUTE ON FUNCTION public.webhook_secret_masked(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.webhook_has_secret(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_webhook_secret(uuid) TO authenticated;