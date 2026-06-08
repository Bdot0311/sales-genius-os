REVOKE SELECT (key) ON public.api_keys FROM authenticated, anon;
REVOKE SELECT (config) ON public.integrations FROM authenticated, anon;
REVOKE SELECT (secret) ON public.webhooks FROM authenticated, anon;

CREATE POLICY "No direct access" ON public.rl_buckets FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "No direct access" ON public.api_cache FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);