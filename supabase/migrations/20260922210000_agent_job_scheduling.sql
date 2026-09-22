-- Phase 3 of docs/AGENT_BATCH_QUEUE.md: a queued batch can reach the outbox.
--
-- Phase 2 drafts and stops. In approval mode that is already the finished
-- behaviour — agent-run does exactly the same thing, because pending work
-- belongs in the Drafts tab where a person can find it. Phase 3 is therefore
-- only about a job whose autonomy was "autonomous" when the user asked.
--
-- It does not add a sender. send-email authenticates from a user's JWT and the
-- worker holds the service role, and the cron sender talks to Gmail directly
-- through four hundred lines of token refresh, bounce handling and cap checks.
-- A third send path for the highest-stakes code in the product is the opposite
-- of what this queue was for. So the worker writes the row schedule_drafts
-- already writes, and process-scheduled-emails remains the only thing that
-- sends — with every cap it already enforces.
--
-- Two columns, both on the item. How many a job has scheduled and whether it
-- has reached its ceiling are counted from these rows rather than kept in a
-- counter on the job: several passes and several workers contribute to one
-- job, and a tally that only one of them updates is a tally that drifts.
--
-- Additive only.

ALTER TABLE public.agent_job_items
  -- The outbox row this item produced, when it produced one.
  ADD COLUMN IF NOT EXISTS scheduled_email_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_agent_job_items_scheduled
  ON public.agent_job_items(job_id) WHERE scheduled_email_id IS NOT NULL;
