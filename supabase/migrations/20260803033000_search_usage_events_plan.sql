-- Record which tier each search ran under.
--
-- search_usage_events already captures results, provider source and credits,
-- but not the plan. Sizing the per-tier daily caps means grouping provider
-- spend by tier, which is not answerable without it — and joining to
-- subscriptions after the fact gives the account's *current* plan, not the one
-- the search actually ran under.

ALTER TABLE public.search_usage_events
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Supports "spend over the last N days, grouped by plan", the query this
-- column exists to answer.
CREATE INDEX IF NOT EXISTS idx_search_usage_events_plan_created
  ON public.search_usage_events(plan, created_at DESC);

-- Rows written before this migration default to 'free' and are indistinguishable
-- from genuine free-tier searches, so exclude anything older than this point
-- when analysing by tier.

-- ---------------------------------------------------------------------------
-- Sizing the daily caps once a week of data has accumulated.
--
-- 1. Provider spend per plan. provider_source distinguishes a real upstream
--    call from a cache hit, which costs nothing; status filters out searches
--    that errored before reaching the provider.
--
--    SELECT plan,
--           count(*)                                             AS searches,
--           count(*) FILTER (WHERE provider_source = 'api')       AS provider_searches,
--           sum(results_count) FILTER (WHERE provider_source = 'api') AS provider_results,
--           round(avg(results_count) FILTER (WHERE provider_source = 'api'), 1) AS avg_results,
--           count(*) FILTER (WHERE status = 'error')              AS errored
--      FROM public.search_usage_events
--     WHERE created_at >= now() - interval '7 days'
--     GROUP BY plan
--     ORDER BY provider_results DESC NULLS LAST;
--
-- 2. The busiest accounts against their tier's daily cap. If nobody approaches
--    the cap, it is not what bounds spend and lowering it changes nothing —
--    decide that before touching any number.
--
--    SELECT user_id, plan, count(*) AS searches, max(daily) AS peak_day
--      FROM (
--        SELECT user_id, plan,
--               count(*) OVER (PARTITION BY user_id, date_trunc('day', created_at)) AS daily
--          FROM public.search_usage_events
--         WHERE provider_source = 'api' AND created_at >= now() - interval '7 days'
--      ) t
--     GROUP BY user_id, plan
--     ORDER BY searches DESC
--     LIMIT 20;
--
-- Multiply provider_results by the provider's per-profile rate for actual
-- spend. Until that rate is known these still show relative load per tier and
-- how much repeat traffic the cache already absorbs.
-- ---------------------------------------------------------------------------
