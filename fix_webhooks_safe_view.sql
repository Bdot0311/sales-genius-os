DROP VIEW IF EXISTS public.webhooks_safe;

CREATE VIEW public.webhooks_safe
WITH (security_invoker = true) AS
 SELECT id,
    user_id,
    name,
    url,
    events,
    is_active,
    created_at,
    last_triggered_at,
    total_triggers,
    public.webhook_secret_masked(id) AS secret_masked,
    public.webhook_has_secret(id) AS has_secret,
    direction,
    endpoint_token,
    default_source,
    last_received_at,
    total_received
   FROM public.webhooks w
  WHERE user_id = auth.uid();

GRANT SELECT ON public.webhooks_safe TO authenticated, service_role;
