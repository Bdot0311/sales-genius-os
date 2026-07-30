ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS research_brief jsonb,
  ADD COLUMN IF NOT EXISTS research_sources text[],
  ADD COLUMN IF NOT EXISTS research_confidence text,
  ADD COLUMN IF NOT EXISTS researched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_researched_at ON public.leads (researched_at);