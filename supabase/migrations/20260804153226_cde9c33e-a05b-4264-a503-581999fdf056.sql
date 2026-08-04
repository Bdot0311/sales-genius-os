ALTER TABLE public.agent_chat_threads
  ADD COLUMN IF NOT EXISTS agent_config_id uuid REFERENCES public.agent_configs(id) ON DELETE SET NULL;