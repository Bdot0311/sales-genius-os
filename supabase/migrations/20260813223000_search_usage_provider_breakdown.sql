-- Record which providers actually returned leads for a search.
--
-- Searches now call every configured provider and merge what comes back, and
-- the providers bill per result returned — so a search costs whatever the
-- providers that surfaced leads charged for them, and one that returned nothing
-- costs nothing. That makes spend per provider a real number worth having, and
-- until now it was not recorded at all: provider_source held the string "api",
-- which says only that the result was not served from cache.
--
-- Stored as the per-provider outcome list the backend already returns
-- (provider_attempts), so a row answers "who contributed, and how much" without
-- a join or a guess.

ALTER TABLE public.search_usage_events
  ADD COLUMN IF NOT EXISTS provider_breakdown jsonb;

COMMENT ON COLUMN public.search_usage_events.provider_breakdown IS
  'Per-provider outcome for this search: [{provider, outcome, count|detail}]. '
  'Providers bill per result returned, so this is what a search actually cost.';

-- Spend-by-provider is the query this column exists for, and it only ever looks
-- at searches that returned something.
CREATE INDEX IF NOT EXISTS idx_search_usage_provider_breakdown
  ON public.search_usage_events USING gin (provider_breakdown)
  WHERE provider_breakdown IS NOT NULL;
