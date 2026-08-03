-- Provider-spend telemetry for lead search.
--
-- Searching is free on paid plans — the credit is charged on reveal — so the
-- daily cap is now the only thing bounding what we spend upstream. Sizing that
-- cap needs real numbers rather than a guess, and nothing currently records
-- what a search actually costs: search_transactions only holds credit movements,
-- which paid searches no longer produce.
--
-- One row per search that reached fetch-external-leads. `provider_hit` is false
-- when the backend served the search from cache, which costs nothing upstream,
-- so provider spend is the subset where it is true.

CREATE TABLE IF NOT EXISTS public.search_usage_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  -- Denormalised on purpose: the plan at the time of the search, so a later
  -- upgrade or downgrade does not rewrite history.
  plan text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  -- False when the result came from the backend's cache (no upstream call).
  provider_hit boolean NOT NULL DEFAULT true,
  -- Leads actually returned — upstream cost scales with these, not with calls.
  results_returned integer NOT NULL DEFAULT 0,
  -- What the caller asked for vs the per-plan ceiling that was applied.
  requested_limit integer,
  max_results_allowed integer,
  -- True only on the free tier, which is still metered per search.
  charged_credit boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Supports "spend over the last N days, grouped by plan", the query this table
-- exists to answer.
CREATE INDEX IF NOT EXISTS idx_search_usage_events_plan_created
  ON public.search_usage_events(plan, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_usage_events_user_created
  ON public.search_usage_events(user_id, created_at DESC);

GRANT ALL ON public.search_usage_events TO service_role;
GRANT SELECT ON public.search_usage_events TO authenticated;

ALTER TABLE public.search_usage_events ENABLE ROW LEVEL SECURITY;

-- Operational data, not user-facing: only admins read it. Writes come from the
-- edge function on the service-role key, which bypasses RLS, so no insert
-- policy is granted to authenticated users.
CREATE POLICY "Admins can view search usage events"
  ON public.search_usage_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Sizing the daily cap once a week of data has accumulated.
--
-- 1. Provider spend per plan. `provider_searches` is what actually costs money;
--    `avg_results` shows whether the per-plan results ceiling is being reached.
--
--    SELECT plan,
--           count(*)                                    AS searches,
--           count(*) FILTER (WHERE provider_hit)        AS provider_searches,
--           sum(results_returned) FILTER (WHERE provider_hit) AS provider_results,
--           round(avg(results_returned) FILTER (WHERE provider_hit), 1) AS avg_results,
--           round(100.0 * count(*) FILTER (WHERE NOT provider_hit) / nullif(count(*), 0), 1)
--                                                       AS cache_hit_pct
--      FROM public.search_usage_events
--     WHERE created_at >= now() - interval '7 days'
--     GROUP BY plan
--     ORDER BY provider_results DESC NULLS LAST;
--
-- 2. The busiest accounts, to see whether the cap binds anyone in practice.
--    Compare peak_day against PLAN_SEARCH_LIMITS[plan].dailySearchLimit: if no
--    one approaches it, the cap is not what is bounding spend.
--
--    SELECT user_id, plan, count(*) AS searches,
--           max(daily) AS peak_day
--      FROM (
--        SELECT user_id, plan, created_at,
--               count(*) OVER (PARTITION BY user_id, date_trunc('day', created_at)) AS daily
--          FROM public.search_usage_events
--         WHERE provider_hit AND created_at >= now() - interval '7 days'
--      ) t
--     GROUP BY user_id, plan
--     ORDER BY searches DESC
--     LIMIT 20;
--
-- Multiply `provider_results` by the provider's per-profile rate to get spend,
-- then set each tier's daily cap so a full month stays inside what that tier
-- pays. Until that rate is known, these numbers still show relative load and
-- whether cache hits are already absorbing most repeat traffic.
-- ---------------------------------------------------------------------------
