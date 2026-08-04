ALTER TABLE public.agent_actions
  ADD COLUMN IF NOT EXISTS agent_config_id uuid REFERENCES public.agent_configs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_actions_agent_config_id
  ON public.agent_actions(agent_config_id);

UPDATE public.agent_actions a
SET agent_config_id = c.id
FROM (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.agent_configs
  ORDER BY user_id, is_primary DESC, created_at ASC
) c
WHERE a.agent_config_id IS NULL
  AND c.user_id = a.user_id;