-- Create a secure view that excludes the webhook secret from regular queries
-- Users should not be able to see the full secret after creation

-- Create a view for webhook data without exposing the full secret
CREATE OR REPLACE VIEW public.webhooks_safe AS
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

-- Create a function to get the full secret for a specific webhook owned by the user
-- This should only be called when absolutely necessary (e.g., initial webhook creation)
CREATE OR REPLACE FUNCTION public.get_webhook_secret(webhook_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    webhook_secret TEXT;
    webhook_owner UUID;
BEGIN
    -- Get the webhook and verify ownership
    SELECT secret, user_id INTO webhook_secret, webhook_owner
    FROM public.webhooks
    WHERE id = webhook_id;
    
    -- Check if webhook exists
    IF webhook_secret IS NULL THEN
        RAISE EXCEPTION 'Webhook not found';
    END IF;
    
    -- Verify the caller owns this webhook
    IF webhook_owner != auth.uid() THEN
        RAISE EXCEPTION 'Access denied';
    END IF;
    
    RETURN webhook_secret;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_webhook_secret(UUID) TO authenticated;