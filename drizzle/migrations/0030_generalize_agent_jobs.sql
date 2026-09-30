ALTER TABLE public.agent_job_items
  ALTER COLUMN lead_id DROP NOT NULL;

ALTER TABLE public.agent_job_items
  ADD COLUMN IF NOT EXISTS payload jsonb;

DROP INDEX IF EXISTS public.uq_agent_job_items_job_lead;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_job_items_job_lead
  ON public.agent_job_items(job_id, lead_id)
  WHERE lead_id IS NOT NULL;

ALTER TABLE public.agent_job_items
  DROP CONSTRAINT IF EXISTS agent_job_items_lead_or_payload;
ALTER TABLE public.agent_job_items
  ADD CONSTRAINT agent_job_items_lead_or_payload
  CHECK (lead_id IS NOT NULL OR payload IS NOT NULL);

ALTER TABLE public.agent_jobs
  DROP CONSTRAINT IF EXISTS agent_jobs_kind_check;
ALTER TABLE public.agent_jobs
  ADD CONSTRAINT agent_jobs_kind_check
  CHECK (kind IN ('draft', 'enrich', 'score', 'research', 'search'));

COMMENT ON COLUMN public.agent_job_items.payload IS
  'Work that is not about an existing lead — a search query and its filters. Null for lead-shaped kinds.';