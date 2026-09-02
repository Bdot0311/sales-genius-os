GRANT SELECT (id, user_id, integration_id, integration_name, is_active, connected_email, created_at, updated_at) ON public.integrations TO authenticated;

CREATE OR REPLACE FUNCTION public.get_integration_connection_state()
RETURNS TABLE (
  id uuid,
  integration_id text,
  connected_email text,
  is_active boolean,
  token_expires_at bigint,
  has_refresh_token boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id,
         i.integration_id,
         i.connected_email,
         i.is_active,
         CASE WHEN jsonb_typeof(i.config -> 'expiresAt') = 'number'
              THEN (i.config ->> 'expiresAt')::bigint END AS token_expires_at,
         COALESCE(length(i.config ->> 'refreshToken') > 0, false) AS has_refresh_token
  FROM public.integrations i
  WHERE i.user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_integration_connection_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_integration_connection_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_integration_connection_state() TO service_role;