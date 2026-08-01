CREATE TABLE IF NOT EXISTS public.why_now_research (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claims       jsonb NOT NULL DEFAULT '[]'::jsonb,
  researched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

GRANT SELECT, INSERT, UPDATE ON public.why_now_research TO authenticated;
GRANT ALL ON public.why_now_research TO service_role;

CREATE INDEX IF NOT EXISTS idx_why_now_user_company ON public.why_now_research(user_id, company_id);

ALTER TABLE public.why_now_research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "why_now_select_own" ON public.why_now_research FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "why_now_insert_own" ON public.why_now_research FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "why_now_update_own" ON public.why_now_research FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.research_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

GRANT SELECT ON public.research_usage TO authenticated;
GRANT ALL ON public.research_usage TO service_role;

ALTER TABLE public.research_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research_usage_select_own" ON public.research_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);

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

REVOKE EXECUTE ON FUNCTION public.consume_research(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_research(uuid, integer) TO service_role;