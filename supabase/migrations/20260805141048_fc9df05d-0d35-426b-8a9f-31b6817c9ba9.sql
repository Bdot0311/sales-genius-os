DROP POLICY IF EXISTS "Users can create their own search usage events" ON public.search_usage_events;
REVOKE INSERT, UPDATE, DELETE ON public.search_usage_events FROM authenticated;
GRANT SELECT ON public.search_usage_events TO authenticated;
GRANT ALL ON public.search_usage_events TO service_role;