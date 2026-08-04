-- Geography for ICP fit scoring.
--
-- The deterministic lead-scoring engine (_shared/lead-scoring.ts) reads
-- lead.country for the "geography" fit dimension. The leads table never had a
-- location column, so that dimension silently never matched. Add the column;
-- enrich-lead populates it from the data provider going forward, and the
-- scoring functions read it once present.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS country text;
