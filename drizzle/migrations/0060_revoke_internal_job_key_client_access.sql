REVOKE EXECUTE ON FUNCTION public.internal_job_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_job_key() TO service_role;