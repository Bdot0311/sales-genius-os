-- Work that is not about one lead.
--
-- agent_job_items was built for drafting, so lead_id is NOT NULL REFERENCES
-- leads(id). That shape is right for drafting, enriching, scoring and
-- researching — every one of those is "do this to that lead". It is wrong for a
-- search, where finding the leads is the work and there is no lead to point at
-- when the job is created.
--
-- So lead_id becomes nullable and a payload rides beside it. The alternative was
-- a second table, which would have meant a second copy of the claim function and
-- the retry sweep — and two copies of one path is exactly how the inline and
-- batch draft paths drifted apart.

ALTER TABLE public.agent_job_items
  ALTER COLUMN lead_id DROP NOT NULL;

ALTER TABLE public.agent_job_items
  ADD COLUMN IF NOT EXISTS payload jsonb;

-- One row per lead per job, still — but only where there is a lead.
--
-- The old unique index covered (job_id, lead_id) and stopped a retried enqueue
-- doubling a batch. Postgres treats NULLs as distinct, so with a nullable column
-- it would have silently stopped constraining anything while still existing,
-- which is worse than not having it. Partial, so it means exactly what it meant
-- before, exactly where it applied before.
DROP INDEX IF EXISTS public.uq_agent_job_items_job_lead;
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_job_items_job_lead
  ON public.agent_job_items(job_id, lead_id)
  WHERE lead_id IS NOT NULL;

-- A lead-shaped item must still carry a lead. Dropping NOT NULL for the sake of
-- one kind must not let the other four enqueue an item that points nowhere and
-- fails at the worker.
ALTER TABLE public.agent_job_items
  DROP CONSTRAINT IF EXISTS agent_job_items_lead_or_payload;
ALTER TABLE public.agent_job_items
  ADD CONSTRAINT agent_job_items_lead_or_payload
  CHECK (lead_id IS NOT NULL OR payload IS NOT NULL);

-- The kinds the worker knows how to run.
--
-- Unconstrained before, because there was only one. A typo'd kind would enqueue
-- cleanly and then sit at 0 of N forever with no worker that recognises it,
-- which reads as stuck rather than as the mistake it is.
ALTER TABLE public.agent_jobs
  DROP CONSTRAINT IF EXISTS agent_jobs_kind_check;
ALTER TABLE public.agent_jobs
  ADD CONSTRAINT agent_jobs_kind_check
  CHECK (kind IN ('draft', 'enrich', 'score', 'research', 'search'));

COMMENT ON COLUMN public.agent_job_items.payload IS
  'Work that is not about an existing lead — a search query and its filters. Null for lead-shaped kinds.';
