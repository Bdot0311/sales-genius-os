ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS endpoint_token text,
  ADD COLUMN IF NOT EXISTS default_source text,
  ADD COLUMN IF NOT EXISTS last_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_received integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.webhooks ADD CONSTRAINT webhooks_direction_check CHECK (direction IN ('outbound','inbound'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.webhooks ALTER COLUMN url SET DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS webhooks_endpoint_token_key ON public.webhooks (endpoint_token) WHERE endpoint_token IS NOT NULL;

ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound';

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
    webhook_secret_masked(id) AS secret_masked,
    webhook_has_secret(id) AS has_secret,
    direction,
    endpoint_token,
    default_source,
    last_received_at,
    total_received
   FROM public.webhooks w
  WHERE user_id = auth.uid();

GRANT SELECT ON public.webhooks_safe TO authenticated;

INSERT INTO public.schema_contract (table_name, column_name, note) VALUES
  ('webhooks','direction','outbound vs inbound webhook mode'),
  ('webhooks','endpoint_token','public path token for inbound webhook endpoint'),
  ('webhooks','default_source','default lead source tag for inbound payloads'),
  ('webhooks','last_received_at','last inbound request timestamp'),
  ('webhooks','total_received','count of inbound requests accepted'),
  ('webhook_deliveries','direction','outbound send vs inbound receipt')
ON CONFLICT DO NOTHING;