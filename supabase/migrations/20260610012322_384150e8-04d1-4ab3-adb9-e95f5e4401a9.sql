-- Revoke column-level SELECT on sensitive columns to ensure they are not readable via Data API
REVOKE SELECT (key) ON public.api_keys FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhooks FROM authenticated, anon;

-- Integrations.config holds OAuth access/refresh tokens. Revoke client read access;
-- application reads only non-sensitive columns (id, integration_id, connected_email, is_active, updated_at).
-- Edge functions use service_role, which retains full access.
REVOKE SELECT (config) ON public.integrations FROM authenticated, anon;