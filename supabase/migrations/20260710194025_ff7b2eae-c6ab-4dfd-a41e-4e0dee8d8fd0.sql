
CREATE OR REPLACE FUNCTION public.admin_upsert_vault_secret(_name text, _secret text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
BEGIN
  -- Only callable by service_role (edge function context).
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = _name LIMIT 1;

  IF v_existing_id IS NULL THEN
    PERFORM vault.create_secret(_secret, _name);
  ELSE
    PERFORM vault.update_secret(v_existing_id, _secret, _name);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_vault_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_vault_secret(text, text) TO service_role;
