
-- 1) Lock down integrations.config (OAuth tokens) from client-side reads.
--    Edge functions use service_role and are unaffected.
REVOKE SELECT (config) ON public.integrations FROM authenticated;
REVOKE SELECT (config) ON public.integrations FROM anon;

-- 2) Fix api_cache policy: service_role bypasses RLS, so the jwt-role check
--    is dead code and misleading. Drop it; keep RLS enabled so no client role
--    can reach the table directly.
DROP POLICY IF EXISTS "Service role can manage cache" ON public.api_cache;

-- 3) rl_buckets has RLS enabled but zero policies. That is correct (locked to
--    clients; consumed only by SECURITY DEFINER function consume_rate_limit).
--    Make the intent explicit so future audits don't flag it.
COMMENT ON TABLE public.rl_buckets IS
  'Rate-limit buckets. RLS enabled with no policies by design: only the SECURITY DEFINER function public.consume_rate_limit() writes/reads this table. Direct client access is intentionally denied.';
