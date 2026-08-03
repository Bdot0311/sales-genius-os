-- 1) Support access grants: validate scopes server-side, prevent self-service escalation
DROP POLICY IF EXISTS "Users create own grants" ON public.support_access_grants;
CREATE POLICY "Users create own grants"
ON public.support_access_grants
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND revoked_at IS NULL
  AND completed_at IS NULL
  AND scopes <@ ARRAY['campaign_assets'::text, 'leads'::text]
  AND array_length(scopes, 1) BETWEEN 1 AND 2
);

CREATE OR REPLACE FUNCTION public.validate_support_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed text[] := ARRAY['campaign_assets','leads'];
  s text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Only the account owner may create a grant for themselves
    IF auth.uid() IS NOT NULL AND NEW.user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Support access grants can only be created for your own account';
    END IF;

    NEW.revoked_at := NULL;
    NEW.revoked_by := NULL;
    NEW.completed_at := NULL;

    IF NEW.scopes IS NULL OR array_length(NEW.scopes, 1) IS NULL THEN
      NEW.scopes := allowed;
    END IF;

    -- Reject any scope outside the fixed, product-defined allow list
    FOREACH s IN ARRAY NEW.scopes LOOP
      IF NOT (s = ANY (allowed)) THEN
        RAISE EXCEPTION 'Unsupported support access scope: %', s;
      END IF;
    END LOOP;

    -- De-duplicate scopes
    SELECT array_agg(DISTINCT x ORDER BY x) INTO NEW.scopes FROM unnest(NEW.scopes) AS x;

    -- Grants are always time-boxed, never longer than 14 days
    IF NEW.expires_at IS NULL OR NEW.expires_at > now() + interval '14 days' THEN
      NEW.expires_at := now() + interval '14 days';
    END IF;
    IF NEW.expires_at <= now() THEN
      RAISE EXCEPTION 'Grant expiry must be in the future';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Warmup messages: guarantee participant ids always match the owning accounts
CREATE OR REPLACE FUNCTION public.validate_warmup_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  from_owner uuid;
  to_owner uuid;
BEGIN
  IF NEW.from_account_id IS NULL OR NEW.to_account_id IS NULL THEN
    RAISE EXCEPTION 'Warmup messages require both sending accounts';
  END IF;

  SELECT user_id INTO from_owner FROM public.sending_accounts WHERE id = NEW.from_account_id;
  SELECT user_id INTO to_owner FROM public.sending_accounts WHERE id = NEW.to_account_id;

  IF from_owner IS NULL OR to_owner IS NULL THEN
    RAISE EXCEPTION 'Unknown sending account on warmup message';
  END IF;

  -- Participant ids are always derived from the accounts, never client supplied
  NEW.from_user_id := from_owner;
  NEW.to_user_id := to_owner;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_warmup_message_trg ON public.warmup_messages;
CREATE TRIGGER validate_warmup_message_trg
BEFORE INSERT OR UPDATE ON public.warmup_messages
FOR EACH ROW EXECUTE FUNCTION public.validate_warmup_message();