REVOKE ALL ON FUNCTION public.seed_objection_entries(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.seed_objections_on_agent_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seed_objection_entries(uuid) TO service_role;