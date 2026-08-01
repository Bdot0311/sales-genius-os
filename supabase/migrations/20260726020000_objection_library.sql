-- Phase 2: Objection Library
-- A structured, retrievable set of objection talk tracks for the AI SDR agent,
-- replacing the flat agent_configs.objection_responses map. User-scoped (no
-- workspace table), additive only.

CREATE TABLE IF NOT EXISTS public.objection_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           text NOT NULL,  -- pricing | timing | competitor | authority | status_quo | no_need | custom
  label          text,           -- optional display label, mainly for custom entries
  trigger_terms  text[] NOT NULL DEFAULT '{}',
  positioning    text,
  talk_track     text,
  proof_points   jsonb NOT NULL DEFAULT '[]'::jsonb,
  do_not_say     text[] NOT NULL DEFAULT '{}',
  -- competitor entries carry these; null for other types
  competitor_name text,
  strengths      text,
  weaknesses     text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objection_entries_user_type ON public.objection_entries(user_id, type);

ALTER TABLE public.objection_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "objection_entries_select_own" ON public.objection_entries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "objection_entries_insert_own" ON public.objection_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "objection_entries_update_own" ON public.objection_entries
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "objection_entries_delete_own" ON public.objection_entries
  FOR DELETE USING (auth.uid() = user_id);

-- Seed six empty typed entries so the structure is obvious. Idempotent, and it
-- prefills NO claims: positioning, talk_track, and proof_points stay empty.
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

-- Seed on AI SDR config creation.
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

-- Backfill existing AI SDR users.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.agent_configs LOOP
    PERFORM public.seed_objection_entries(r.user_id);
  END LOOP;
END $$;
