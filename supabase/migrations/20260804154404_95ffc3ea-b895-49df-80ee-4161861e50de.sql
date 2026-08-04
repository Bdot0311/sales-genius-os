ALTER TABLE public.agent_actions
  ADD COLUMN IF NOT EXISTS run_id uuid;

CREATE INDEX IF NOT EXISTS idx_agent_actions_run_id ON public.agent_actions (run_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_user_created ON public.agent_actions (user_id, created_at DESC);