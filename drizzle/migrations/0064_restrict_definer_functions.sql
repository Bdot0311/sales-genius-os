REVOKE EXECUTE ON FUNCTION public.reengagement_candidates(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reengagement_candidates(integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_get_lead_intelligence_outcomes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_lead_intelligence_outcomes() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_service_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_status() TO authenticated, service_role;