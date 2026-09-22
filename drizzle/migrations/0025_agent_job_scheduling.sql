ALTER TABLE public.agent_job_items
  ADD COLUMN IF NOT EXISTS scheduled_email_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_agent_job_items_scheduled
  ON public.agent_job_items(job_id) WHERE scheduled_email_id IS NOT NULL;