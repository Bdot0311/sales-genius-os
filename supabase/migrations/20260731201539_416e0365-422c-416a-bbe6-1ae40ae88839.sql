CREATE OR REPLACE VIEW public.webhooks_safe
WITH (security_invoker = false) AS
SELECT
  id,
  user_id,
  name,
  url,
  events,
  is_active,
  created_at,
  last_triggered_at,
  total_triggers,
  CASE WHEN length(secret) > 8 THEN substring(secret, 1, 8) || '...' ELSE '********' END AS secret_masked,
  CASE WHEN secret IS NOT NULL AND secret <> '' THEN true ELSE false END AS has_secret
FROM public.webhooks
WHERE user_id = auth.uid();

REVOKE ALL ON public.webhooks_safe FROM anon;
GRANT SELECT ON public.webhooks_safe TO authenticated;