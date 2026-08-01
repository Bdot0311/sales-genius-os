-- Phase 6: Buying Committee Map.
-- Personas define the slots a complete buying committee needs; the map joins an
-- account's known contacts to those slots. User-scoped, additive only.

CREATE TABLE IF NOT EXISTS public.personas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label          text NOT NULL,
  seniority_band text,             -- e.g. c_level, vp, director, manager, ic
  function       text,             -- e.g. exec, sales, marketing, technical, finance
  required       boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_personas_user ON public.personas(user_id);
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "personas_select_own" ON public.personas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "personas_insert_own" ON public.personas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "personas_update_own" ON public.personas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "personas_delete_own" ON public.personas FOR DELETE USING (auth.uid() = user_id);

-- Seed a sensible default committee. Idempotent.
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
