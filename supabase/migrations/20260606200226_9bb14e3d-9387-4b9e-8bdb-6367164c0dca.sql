REVOKE SELECT (config) ON public.integrations FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhooks FROM authenticated, anon;