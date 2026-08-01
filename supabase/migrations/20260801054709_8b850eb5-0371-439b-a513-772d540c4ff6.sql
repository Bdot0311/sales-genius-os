CREATE TABLE IF NOT EXISTS public.personas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label          text NOT NULL,
  seniority_band text,
  function       text,
  required       boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.personas TO authenticated;
GRANT ALL ON public.personas TO service_role;

CREATE INDEX IF NOT EXISTS idx_personas_user ON public.personas(user_id);
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personas_select_own" ON public.personas FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "personas_insert_own" ON public.personas FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "personas_update_own" ON public.personas FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "personas_delete_own" ON public.personas FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.seed_personas(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.personas WHERE user_id = p_user_id) THEN RETURN; END IF;
  INSERT INTO public.personas (user_id, label, seniority_band, function, required, sort_order) VALUES
    (p_user_id, 'economic buyer',      'vp',       'exec',      true,  1),
    (p_user_id, 'champion',            'director', 'sales',     true,  2),
    (p_user_id, 'technical evaluator', 'manager',  'technical', false, 3),
    (p_user_id, 'end user',            'ic',       'sales',     false, 4);
END;
$$;