-- Fix the security definer view warning by using security_invoker
-- This ensures the view respects RLS policies of the querying user

DROP VIEW IF EXISTS public.webhooks_safe;

CREATE VIEW public.webhooks_safe 
WITH (security_invoker = true)
AS
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
    -- Only show masked version of secret (first 8 chars + ellipsis)
    CASE 
        WHEN length(secret) > 8 THEN substring(secret, 1, 8) || '...'
        ELSE '********'
    END AS secret_masked,
    -- Include a flag indicating if secret exists
    CASE WHEN secret IS NOT NULL AND secret != '' THEN true ELSE false END AS has_secret
FROM public.webhooks;

-- Grant access to authenticated users (RLS on base table will filter)
GRANT SELECT ON public.webhooks_safe TO authenticated;