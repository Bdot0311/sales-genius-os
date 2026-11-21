DROP POLICY IF EXISTS appsumo_config_read ON public.appsumo_plan_config;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.appsumo_plan_config FROM anon, authenticated;
GRANT ALL ON public.appsumo_plan_config TO service_role;