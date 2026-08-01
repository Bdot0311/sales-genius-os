-- 1. contacts: standardize all CRUD policies on the authenticated role
DROP POLICY IF EXISTS "Users can view own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can create own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can delete own contacts" ON public.contacts;

CREATE POLICY "Users can view own contacts"
ON public.contacts FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own contacts"
ON public.contacts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contacts"
ON public.contacts FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- 2. support_access_grants: admins may only close out a grant, never widen it
CREATE OR REPLACE FUNCTION public.enforce_support_grant_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- The grantee (the customer) may still fully manage their own grant.
  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Anyone else (i.e. support admins) may only end a grant: consent scope,
  -- owner and expiry are immutable, and expiry can never be pushed out.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.scopes IS DISTINCT FROM OLD.scopes
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.granted_at IS DISTINCT FROM OLD.granted_at THEN
    RAISE EXCEPTION 'Support grants cannot be re-scoped or extended';
  END IF;

  -- Cannot resurrect a grant the user already revoked or that already ended.
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'Revoked support grants cannot be reactivated';
  END IF;
  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS NULL THEN
    RAISE EXCEPTION 'Completed support grants cannot be reactivated';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_support_grant_immutability ON public.support_access_grants;
CREATE TRIGGER enforce_support_grant_immutability
BEFORE UPDATE ON public.support_access_grants
FOR EACH ROW EXECUTE FUNCTION public.enforce_support_grant_immutability();

-- Block admins from minting grants on a user's behalf (self-escalation path).
DROP POLICY IF EXISTS "Users create own grants" ON public.support_access_grants;
CREATE POLICY "Users create own grants"
ON public.support_access_grants FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND NOT public.has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = user_id);
