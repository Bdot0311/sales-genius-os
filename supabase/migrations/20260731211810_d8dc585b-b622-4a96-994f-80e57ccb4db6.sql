-- Owner-checked helpers so the view never needs to read the plaintext secret column.
CREATE OR REPLACE FUNCTION public.webhook_secret_masked(_webhook_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _secret text;
BEGIN
  SELECT w.user_id, w.secret INTO _owner, _secret
  FROM public.webhooks w WHERE w.id = _webhook_id;

  IF _owner IS NULL OR _owner <> auth.uid() THEN
    RETURN NULL;
  END IF;

  IF _secret IS NULL OR _secret = '' THEN
    RETURN '********';
  END IF;

  IF length(_secret) > 8 THEN
    RETURN substring(_secret, 1, 8) || '...';
  END IF;

  RETURN '********';
END;
$$;

CREATE OR REPLACE FUNCTION public.webhook_has_secret(_webhook_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid;
  _secret text;
BEGIN
  SELECT w.user_id, w.secret INTO _owner, _secret
  FROM public.webhooks w WHERE w.id = _webhook_id;

  IF _owner IS NULL OR _owner <> auth.uid() THEN
    RETURN false;
  END IF;

  RETURN _secret IS NOT NULL AND _secret <> '';
END;
$$;

REVOKE ALL ON FUNCTION public.webhook_secret_masked(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.webhook_has_secret(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.webhook_secret_masked(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.webhook_has_secret(uuid) TO authenticated, service_role;

-- Recreate the view as SECURITY INVOKER so the querying user's own RLS/permissions apply.
DROP VIEW IF EXISTS public.webhooks_safe;

CREATE VIEW public.webhooks_safe
WITH (security_invoker = true) AS
SELECT
  w.id,
  w.user_id,
  w.name,
  w.url,
  w.events,
  w.is_active,
  w.created_at,
  w.last_triggered_at,
  w.total_triggers,
  public.webhook_secret_masked(w.id) AS secret_masked,
  public.webhook_has_secret(w.id) AS has_secret
FROM public.webhooks w
WHERE w.user_id = auth.uid();

GRANT SELECT ON public.webhooks_safe TO authenticated;
GRANT SELECT ON public.webhooks_safe TO service_role;