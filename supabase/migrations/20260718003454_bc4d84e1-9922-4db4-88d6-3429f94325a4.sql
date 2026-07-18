DROP POLICY IF EXISTS "Pro users can view own API usage" ON public.api_usage_log;
DROP POLICY IF EXISTS "Users can view own api usage logs" ON public.api_usage_log;
CREATE POLICY "Users can view own api usage logs" ON public.api_usage_log
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.api_keys k WHERE k.id = api_usage_log.api_key_id AND k.user_id = auth.uid())
  );