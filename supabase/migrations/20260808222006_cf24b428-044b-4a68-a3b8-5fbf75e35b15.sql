ALTER TABLE public.agent_chat_threads
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('agent_chat_threads', 'cancel_requested_at', 'Set by the UI Stop button; agent-chat aborts the turn between steps and clears it.')
ON CONFLICT DO NOTHING;