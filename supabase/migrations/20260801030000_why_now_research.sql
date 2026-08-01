-- Phase 7: Why-Now Research Layer.
-- Sourced "why now" claims per account, cached with a staleness window, with a
-- tier-scaled daily research cap. User-scoped, additive only.

CREATE TABLE IF NOT EXISTS public.why_now_research (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- claims: [{ claim, source_url, confidence: high|medium|low }]
  claims       jsonb NOT NULL DEFAULT '[]'::jsonb,
  researched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

ALTER TABLE public.why_now_research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "why_now_select_own" ON public.why_now_research FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "why_now_insert_own" ON public.why_now_research FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "why_now_update_own" ON public.why_now_research FOR UPDATE USING (auth.uid() = user_id);

-- Per-user daily research counter for the cap.
CREATE TABLE IF NOT EXISTS public.research_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.research_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research_usage_select_own" ON public.research_usage FOR SELECT USING (auth.uid() = user_id);

-- Atomically consume one research unit if under the day's cap. Returns the
-- remaining count, or -1 when the cap is already reached (so no unit is spent).
CREATE OR REPLACE FUNCTION public.consume_research(p_user_id uuid, p_cap integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE today date := (now() AT TIME ZONE 'utc')::date; cur integer;
BEGIN
  INSERT INTO public.research_usage (user_id, day, count) VALUES (p_user_id, today, 0)
    ON CONFLICT (user_id, day) DO NOTHING;
  SELECT count INTO cur FROM public.research_usage WHERE user_id = p_user_id AND day = today FOR UPDATE;
  IF cur >= p_cap THEN RETURN -1; END IF;
  UPDATE public.research_usage SET count = count + 1 WHERE user_id = p_user_id AND day = today;
  RETURN p_cap - (cur + 1);
END;
$$;
