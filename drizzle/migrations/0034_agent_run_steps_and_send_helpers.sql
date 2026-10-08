CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.agent_chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  run_pass INTEGER NOT NULL DEFAULT 0,
  step_index INTEGER NOT NULL,
  messages JSONB NOT NULL,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage JSONB,
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('running','done','failed')),
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CONSTRAINT agent_run_steps_unique_step UNIQUE (thread_id, run_pass, step_index)
);
CREATE INDEX IF NOT EXISTS agent_run_steps_started_idx ON public.agent_run_steps (started_at);
GRANT SELECT ON public.agent_run_steps TO authenticated;
GRANT ALL ON public.agent_run_steps TO service_role;
ALTER TABLE public.agent_run_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own agent run steps" ON public.agent_run_steps FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.agent_run_mutations (
  thread_id UUID NOT NULL REFERENCES public.agent_chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  mutation_key TEXT NOT NULL,
  tool_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, mutation_key)
);
GRANT SELECT ON public.agent_run_mutations TO authenticated;
GRANT ALL ON public.agent_run_mutations TO service_role;
ALTER TABLE public.agent_run_mutations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own agent run mutations" ON public.agent_run_mutations FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.rescore_queue ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.get_monthly_email_count(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.sent_emails
  WHERE user_id = p_user_id
    AND (auth.role() = 'service_role' OR auth.uid() = p_user_id)
    AND status IN ('sent','delivered','opened','clicked','replied')
    AND sent_at >= date_trunc('month', now());
$$;
REVOKE ALL ON FUNCTION public.get_monthly_email_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_email_count(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_rescore_items(p_row_ids UUID[])
RETURNS TABLE (id UUID, user_id UUID, lead_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id FROM public.rescore_queue q
    WHERE q.id = ANY(p_row_ids) AND q.status = 'pending'
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.rescore_queue r SET status = 'processing', claimed_at = now()
  FROM picked WHERE r.id = picked.id
  RETURNING r.id, r.user_id, r.lead_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_rescore_items(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rescore_items(UUID[]) TO service_role;