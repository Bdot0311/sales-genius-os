REVOKE EXECUTE ON FUNCTION public.seed_personas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_personas(uuid) TO service_role;