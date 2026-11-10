-- Match supabase/migrations/20261110120000_research_claim_idempotent.sql.
-- Drizzle's 0034 created agent_run_mutations without status. The Supabase
-- migration that added the column only ran ALTER, so a database that created
-- the table from this folder never got it.

ALTER TABLE public.agent_run_mutations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

UPDATE public.agent_run_mutations SET status = 'completed' WHERE status IS NULL;
ALTER TABLE public.agent_run_mutations ALTER COLUMN status SET DEFAULT 'completed';
ALTER TABLE public.agent_run_mutations ALTER COLUMN status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_run_mutations_status_check'
  ) THEN
    ALTER TABLE public.agent_run_mutations
      ADD CONSTRAINT agent_run_mutations_status_check
      CHECK (status IN ('dispatching', 'completed', 'unknown'));
  END IF;
END $$;
