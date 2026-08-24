CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  fn text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  credits_charged integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own ai usage" ON public.ai_usage_events;
CREATE POLICY "Users view own ai usage"
  ON public.ai_usage_events FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx
  ON public.ai_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_created_idx
  ON public.ai_usage_events (created_at DESC);

CREATE OR REPLACE FUNCTION public.record_ai_usage(
  p_fn text,
  p_provider text,
  p_model text,
  p_prompt_tokens integer DEFAULT 0,
  p_completion_tokens integer DEFAULT 0,
  p_cost_usd numeric DEFAULT 0,
  p_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits integer := 0;
  v_remaining integer;
  v_exempt boolean := false;
BEGIN
  -- 1 in-app credit ≈ $0.002 of direct model spend. AI calls never block on
  -- credits (the generation already happened); the balance simply reflects cost.
  v_credits := GREATEST(0, CEIL(COALESCE(p_cost_usd, 0) / 0.002))::integer;

  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(billing_exempt, false), COALESCE(search_credits_remaining, 0)
      INTO v_exempt, v_remaining
      FROM public.subscriptions
     WHERE user_id = p_user_id;

    IF COALESCE(v_exempt, false) OR public.has_role(p_user_id, 'admin') THEN
      v_credits := 0;
    ELSIF v_credits > 0 AND v_remaining IS NOT NULL THEN
      UPDATE public.subscriptions
         SET search_credits_remaining = GREATEST(0, COALESCE(search_credits_remaining, 0) - v_credits)
       WHERE user_id = p_user_id;

      INSERT INTO public.search_transactions (user_id, type, amount, balance_after, description)
      VALUES (p_user_id, 'usage', -v_credits, GREATEST(0, v_remaining - v_credits),
              'AI usage: ' || p_fn);
    END IF;
  END IF;

  INSERT INTO public.ai_usage_events (
    user_id, fn, provider, model, prompt_tokens, completion_tokens, cost_usd, credits_charged
  ) VALUES (
    p_user_id, p_fn, p_provider, p_model,
    COALESCE(p_prompt_tokens, 0), COALESCE(p_completion_tokens, 0),
    COALESCE(p_cost_usd, 0), v_credits
  );

  RETURN v_credits;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_usage(text, text, text, integer, integer, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ai_usage(text, text, text, integer, integer, numeric, uuid) TO service_role;

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT 'ai_usage_events', c, 'AI cost metering (direct provider keys)'
FROM (VALUES ('fn'), ('provider'), ('model'), ('cost_usd'), ('credits_charged')) AS t(c)
WHERE NOT EXISTS (
  SELECT 1 FROM public.schema_contract sc
  WHERE sc.table_name = 'ai_usage_events' AND sc.column_name = t.c
);