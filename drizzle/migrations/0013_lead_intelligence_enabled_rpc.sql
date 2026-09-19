-- Feature flags are admin-only readable, but the lead UI needs to know whether
-- the intelligence layer is switched on. One boolean, nothing else exposed.
CREATE OR REPLACE FUNCTION public.lead_intelligence_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((SELECT is_enabled FROM feature_flags WHERE name = 'jevLeadIntelligence'), false);
$$;

REVOKE ALL ON FUNCTION public.lead_intelligence_enabled() FROM public;
GRANT EXECUTE ON FUNCTION public.lead_intelligence_enabled() TO authenticated;
