CREATE TABLE IF NOT EXISTS public.objection_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           text NOT NULL,
  label          text,
  trigger_terms  text[] NOT NULL DEFAULT '{}',
  positioning    text,
  talk_track     text,
  proof_points   jsonb NOT NULL DEFAULT '[]'::jsonb,
  do_not_say     text[] NOT NULL DEFAULT '{}',
  competitor_name text,
  strengths      text,
  weaknesses     text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objection_entries TO authenticated;
GRANT ALL ON public.objection_entries TO service_role;

CREATE INDEX IF NOT EXISTS idx_objection_entries_user_type ON public.objection_entries(user_id, type);

ALTER TABLE public.objection_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "objection_entries_select_own" ON public.objection_entries;
DROP POLICY IF EXISTS "objection_entries_insert_own" ON public.objection_entries;
DROP POLICY IF EXISTS "objection_entries_update_own" ON public.objection_entries;
DROP POLICY IF EXISTS "objection_entries_delete_own" ON public.objection_entries;

CREATE POLICY "objection_entries_select_own" ON public.objection_entries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "objection_entries_insert_own" ON public.objection_entries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "objection_entries_update_own" ON public.objection_entries
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "objection_entries_delete_own" ON public.objection_entries
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.seed_objection_entries(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.objection_entries WHERE user_id = p_user_id) THEN
    RETURN;
  END IF;
  INSERT INTO public.objection_entries (user_id, type)
  SELECT p_user_id, t
  FROM unnest(ARRAY['pricing', 'timing', 'competitor', 'authority', 'status_quo', 'no_need']) AS t;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_objections_on_agent_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_objection_entries(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_objections ON public.agent_configs;
CREATE TRIGGER trg_seed_objections
  AFTER INSERT ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.seed_objections_on_agent_config();

CREATE OR REPLACE FUNCTION public.update_objection_entries_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_objection_entries_updated_at ON public.objection_entries;
CREATE TRIGGER trg_objection_entries_updated_at
  BEFORE UPDATE ON public.objection_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_objection_entries_updated_at();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.agent_configs LOOP
    PERFORM public.seed_objection_entries(r.user_id);
  END LOOP;
END $$;