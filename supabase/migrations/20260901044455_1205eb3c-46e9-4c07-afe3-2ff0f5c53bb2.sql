-- 1. Remove unauthenticated (anon) table privileges on admin/security tables that are
-- published to Realtime. RLS already restricts them, but anon had blanket grants.
REVOKE ALL ON public.admin_settings FROM anon;
REVOKE ALL ON public.security_events FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.blocked_ips FROM anon;
REVOKE ALL ON public.api_usage_log FROM anon;
REVOKE ALL ON public.rate_limit_buckets FROM anon;
REVOKE ALL ON public.stripe_webhook_events FROM anon;
REVOKE ALL ON public.signup_diagnostics FROM anon;
REVOKE ALL ON public.feature_flags FROM anon;
GRANT ALL ON public.admin_settings TO service_role;
GRANT ALL ON public.security_events TO service_role;
GRANT ALL ON public.audit_logs TO service_role;
GRANT ALL ON public.blocked_ips TO service_role;
GRANT ALL ON public.api_usage_log TO service_role;
GRANT ALL ON public.rate_limit_buckets TO service_role;
GRANT ALL ON public.stripe_webhook_events TO service_role;
GRANT ALL ON public.signup_diagnostics TO service_role;
GRANT ALL ON public.feature_flags TO service_role;

-- 2. Leads: ensure no anon access; owner-scoped policies stay in place.
REVOKE ALL ON public.leads FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

-- 3. Harden support access grants: users may only revoke, never widen scopes or extend expiry.
CREATE OR REPLACE FUNCTION public.enforce_support_grant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- hard-cap grant lifetime at 14 days and validate scopes server-side
    IF NEW.expires_at IS NULL OR NEW.expires_at > now() + interval '14 days' THEN
      NEW.expires_at := now() + interval '14 days';
    END IF;
    IF NEW.scopes IS NULL OR array_length(NEW.scopes, 1) IS NULL THEN
      RAISE EXCEPTION 'At least one support scope is required';
    END IF;
    IF NOT (NEW.scopes <@ ARRAY['campaign_assets','leads']) THEN
      RAISE EXCEPTION 'Invalid support access scope requested';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: non-admins can only revoke/complete their own grant. Immutable fields enforced.
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.scopes IS DISTINCT FROM OLD.scopes
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
      RAISE EXCEPTION 'Support grant scope and expiry cannot be modified';
    END IF;
    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'A revoked support grant cannot be reactivated';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_support_grant_integrity ON public.support_access_grants;
CREATE TRIGGER enforce_support_grant_integrity
BEFORE INSERT OR UPDATE ON public.support_access_grants
FOR EACH ROW EXECUTE FUNCTION public.enforce_support_grant_integrity();

REVOKE ALL ON public.support_access_grants FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.support_access_grants TO authenticated;
GRANT ALL ON public.support_access_grants TO service_role;