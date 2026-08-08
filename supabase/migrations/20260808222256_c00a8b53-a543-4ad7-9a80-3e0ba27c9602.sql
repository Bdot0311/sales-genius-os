CREATE TABLE IF NOT EXISTS public.agent_step_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  thread_id uuid,
  turn_id uuid NOT NULL,
  agent_config_id uuid,
  step_type text NOT NULL DEFAULT 'tool',
  tool_name text NOT NULL,
  duration_ms integer NOT NULL,
  status text NOT NULL DEFAULT 'success',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_step_metrics TO authenticated;
GRANT ALL ON public.agent_step_metrics TO service_role;

ALTER TABLE public.agent_step_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own agent step metrics" ON public.agent_step_metrics;
CREATE POLICY "Users view own agent step metrics"
ON public.agent_step_metrics
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS agent_step_metrics_user_created_idx
  ON public.agent_step_metrics (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_step_metrics_turn_idx
  ON public.agent_step_metrics (turn_id);

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT 'agent_step_metrics', c, 'SDR step timing analytics (agent-chat writes, Agent > Performance reads).'
FROM unnest(ARRAY['id','user_id','thread_id','turn_id','agent_config_id','step_type','tool_name','duration_ms','status','detail','created_at']) AS c
ON CONFLICT DO NOTHING;