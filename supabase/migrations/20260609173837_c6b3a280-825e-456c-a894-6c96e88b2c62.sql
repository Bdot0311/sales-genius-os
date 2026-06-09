REVOKE SELECT ON public.webhooks FROM authenticated, anon;
GRANT SELECT (id, user_id, name, url, events, is_active, created_at, last_triggered_at, total_triggers) ON public.webhooks TO authenticated;