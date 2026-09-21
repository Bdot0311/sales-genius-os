CREATE OR REPLACE FUNCTION public.validate_support_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY['sequences','targeting','agent','leads'];
  s text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NOT NULL AND NEW.user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Support access grants can only be created for your own account';
    END IF;

    NEW.revoked_at := NULL;
    NEW.revoked_by := NULL;
    NEW.completed_at := NULL;

    IF NEW.scopes IS NULL OR array_length(NEW.scopes, 1) IS NULL THEN
      NEW.scopes := allowed;
    END IF;

    IF 'campaign_assets' = ANY(NEW.scopes) THEN
      NEW.scopes := ARRAY(
        SELECT DISTINCT x FROM unnest(
          array_remove(NEW.scopes, 'campaign_assets') || ARRAY['sequences','targeting','agent']
        ) AS x
      );
    END IF;

    FOREACH s IN ARRAY NEW.scopes LOOP
      IF NOT (s = ANY(allowed)) THEN
        RAISE EXCEPTION 'Unsupported support access scope: %', s;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Users create own grants" ON public.support_access_grants;
CREATE POLICY "Users create own grants"
ON public.support_access_grants FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND revoked_at IS NULL
  AND completed_at IS NULL
  AND scopes <@ ARRAY['sequences','targeting','agent','leads']
  AND array_length(scopes, 1) BETWEEN 1 AND 4
);