ALTER TABLE public.search_usage_events
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_search_usage_events_plan_created
  ON public.search_usage_events(plan, created_at DESC);