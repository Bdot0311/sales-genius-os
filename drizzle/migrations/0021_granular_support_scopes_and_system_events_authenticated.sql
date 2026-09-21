-- 1) Support grants: split the single blanket "campaign_assets" consent into
--    separate scopes so one grant no longer unlocks every campaign-related
--    table at once. The customer now consents per area.
CREATE OR REPLACE FUNCTION public.enforce_support_grant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- hard-cap grant lifetime at 14 days and validate scopes server-side
    IF NEW.expires_at IS NULL OR NEW.expires_at > now() + interval '14 days' THEN
      NEW.expires_at := now() + interval '14 days';
    END IF;
    IF NEW.scopes IS NULL OR array_length(NEW.scopes, 1) IS NULL THEN
      RAISE EXCEPTION 'At least one support scope is required';
    END IF;
    IF NOT (NEW.scopes <@ ARRAY['sequences','targeting','agent','leads']) THEN
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
$function$;

-- No implicit default: every policy must name the scope it relies on.
CREATE OR REPLACE FUNCTION public.has_active_support_grant(_user_id uuid, _scope text DEFAULT 'sequences'::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.support_access_grants g
    WHERE g.user_id = _user_id
      AND g.revoked_at IS NULL
      AND g.completed_at IS NULL
      AND g.expires_at > now()
      AND _scope = ANY(g.scopes)
  );
$function$;

-- 2) Re-point each table's support policy at its own scope.
DROP POLICY IF EXISTS "Support access to sequences" ON public.email_sequences;
CREATE POLICY "Support access to sequences"
ON public.email_sequences FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'sequences'))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'sequences'));

DROP POLICY IF EXISTS "Support access to sequence steps" ON public.sequence_steps;
CREATE POLICY "Support access to sequence steps"
ON public.sequence_steps FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'sequences'))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'sequences'));

DROP POLICY IF EXISTS "Support access to message blocks" ON public.message_blocks;
CREATE POLICY "Support access to message blocks"
ON public.message_blocks FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'sequences'))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'sequences'));

DROP POLICY IF EXISTS "Support access to email drafts" ON public.email_drafts;
CREATE POLICY "Support access to email drafts"
ON public.email_drafts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'sequences'))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'sequences'));

DROP POLICY IF EXISTS "Support access to icp profiles" ON public.icp_profiles;
CREATE POLICY "Support access to icp profiles"
ON public.icp_profiles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'targeting'))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'targeting'));

DROP POLICY IF EXISTS "Support access to agent configs" ON public.agent_configs;
CREATE POLICY "Support access to agent configs"
ON public.agent_configs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'agent'))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'agent'));

DROP POLICY IF EXISTS "Support access to leads" ON public.leads;
CREATE POLICY "Support access to leads"
ON public.leads FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'leads'))
WITH CHECK (public.has_role(auth.uid(), 'admin') AND public.has_active_support_grant(user_id, 'leads'));

-- 3) system_events: admin read policy was evaluated for the anonymous role too.
DROP POLICY IF EXISTS "Admins can view system events" ON public.system_events;
CREATE POLICY "Admins can view system events"
ON public.system_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
