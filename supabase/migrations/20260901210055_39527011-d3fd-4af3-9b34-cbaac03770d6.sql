ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS role_instructions text,
  ADD COLUMN IF NOT EXISTS allowed_tools text[];

ALTER TABLE public.agent_configs DROP CONSTRAINT IF EXISTS agent_configs_role_check;
ALTER TABLE public.agent_configs ADD CONSTRAINT agent_configs_role_check
  CHECK (role = ANY (ARRAY['lead_gen'::text,'outreach'::text,'replies'::text,'full_cycle'::text,'custom'::text]));

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES
  ('agent_configs','role_instructions','custom agent build: extra scope instructions injected into agent chat/run prompts'),
  ('agent_configs','allowed_tools','custom agent build: explicit allow-list of agent chat tool names')
ON CONFLICT DO NOTHING;