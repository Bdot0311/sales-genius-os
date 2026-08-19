ALTER TABLE public.agent_chat_threads
  ADD COLUMN IF NOT EXISTS run_status TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS run_request TEXT,
  ADD COLUMN IF NOT EXISTS run_pass INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS run_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS run_mutation_keys TEXT[] NOT NULL DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_chat_threads_run_status_check') THEN
    ALTER TABLE public.agent_chat_threads
      ADD CONSTRAINT agent_chat_threads_run_status_check CHECK (run_status IN ('idle','running'));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_chat_threads TO authenticated;
GRANT ALL ON public.agent_chat_threads TO service_role;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES
  ('agent_chat_threads', 'run_status', 'idle|running - set by agent-chat so the UI can rejoin an in-flight run after the tab closes.'),
  ('agent_chat_threads', 'run_request', 'The user request the current server-side run is working on; drives the status card.'),
  ('agent_chat_threads', 'run_pass', 'Continuation pass number; agent-chat self-chains until the batch finishes.'),
  ('agent_chat_threads', 'run_started_at', 'When the current server-side run started; used to expire stale runs.'),
  ('agent_chat_threads', 'run_mutation_keys', 'Mutations already completed in this run, carried across continuations to prevent repeats.')
ON CONFLICT DO NOTHING;