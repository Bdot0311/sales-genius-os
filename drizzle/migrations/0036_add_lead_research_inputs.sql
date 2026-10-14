-- Research invalidated itself, and the symptom was the same work done twice.
--
-- isResearchFresh went stale when updated_at ran past researched_at, the idea
-- being that a changed lead needs new context. But public.leads has a BEFORE
-- UPDATE trigger that sets updated_at on EVERY write, and scoring, enrichment,
-- stage changes and the send path all write to the row.
--
-- So "research these 49 leads, qualify them, then draft" invalidated its own
-- research: research wrote the brief, scoring wrote a tier a moment later, and
-- generate-email then found all 49 stale and scraped all 49 sites again. A
-- 14-day cache that could not survive the next step of its own pipeline.
--
-- This records what each brief was built from — domain, company name, profile
-- links — so freshness can ask whether the INPUTS changed rather than whether
-- the row was written to. Plain text rather than a digest: it is compared, not
-- kept secret, and a stale brief is easier to explain when you can read what
-- it was built from.
--
-- Nullable with no backfill on purpose. The value has to come from the same
-- code that writes the brief, and a backfill here would assert that every
-- existing brief matches its row's CURRENT inputs, which is exactly the thing
-- nobody can know. Rows without it fall back to the TTL and to enriched_at,
-- and heal on their next research.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS research_inputs text;

COMMENT ON COLUMN public.leads.research_inputs IS
  'The lead fields the stored research_brief was built from (website, email domain, company name, profile links), lower-cased and pipe-joined. Compared against the row''s current values to decide whether the brief can be reused. Written only by research-lead.';