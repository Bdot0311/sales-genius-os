-- 1) agency_clients: invite_token is a bearer credential. Remove the redundant
--    anon-facing SELECT policy and revoke the column from anon entirely.
DROP POLICY IF EXISTS "Only the owning agency can read agency_clients" ON public.agency_clients;

REVOKE SELECT ON public.agency_clients FROM anon;
REVOKE SELECT (invite_token) ON public.agency_clients FROM anon;

-- 2) scan_gate_leads: open insert path gets server-side validation + throttling.
CREATE OR REPLACE FUNCTION public.validate_scan_gate_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  NEW.email := lower(btrim(coalesce(NEW.email, '')));

  IF NEW.email = '' OR length(NEW.email) > 254
     OR NEW.email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;

  IF NEW.posthog_distinct_id IS NOT NULL THEN
    NEW.posthog_distinct_id := left(btrim(NEW.posthog_distinct_id), 128);
    IF NEW.posthog_distinct_id = '' THEN
      NEW.posthog_distinct_id := NULL;
    END IF;
  END IF;

  IF NEW.scan_context IS NOT NULL AND pg_column_size(NEW.scan_context) > 8192 THEN
    RAISE EXCEPTION 'Scan context payload too large';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.posthog_distinct_id IS NOT NULL THEN
    SELECT count(*) INTO recent_count
    FROM public.scan_gate_leads
    WHERE posthog_distinct_id = NEW.posthog_distinct_id
      AND created_at > now() - interval '1 hour';

    IF recent_count >= 10 THEN
      RAISE EXCEPTION 'Too many submissions, please try again later';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_scan_gate_lead ON public.scan_gate_leads;
CREATE TRIGGER trg_validate_scan_gate_lead
BEFORE INSERT OR UPDATE ON public.scan_gate_leads
FOR EACH ROW EXECUTE FUNCTION public.validate_scan_gate_lead();

-- 3) team_members: let a member read only their own membership row.
DROP POLICY IF EXISTS "Members can view their own membership" ON public.team_members;
CREATE POLICY "Members can view their own membership"
ON public.team_members
FOR SELECT
TO authenticated
USING (member_user_id = auth.uid());