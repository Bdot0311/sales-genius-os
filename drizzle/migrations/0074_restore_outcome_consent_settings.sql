ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS outcome_consent boolean,
  ADD COLUMN IF NOT EXISTS outcome_consent_decided_at timestamptz;

COMMENT ON COLUMN public.profiles.outcome_consent IS 'Tri-state: NULL = not yet asked (never treated as yes), true = agreed, false = declined.';
COMMENT ON COLUMN public.profiles.outcome_consent_decided_at IS 'When the owner last answered; NULL until explicitly answered.';

CREATE TABLE IF NOT EXISTS public.outcome_consent_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  consent boolean NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'prompt',
  CONSTRAINT outcome_consent_log_source_check CHECK (source IN ('prompt', 'settings'))
);
REVOKE ALL ON TABLE public.outcome_consent_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.outcome_consent_log TO authenticated;
GRANT SELECT, INSERT ON TABLE public.outcome_consent_log TO service_role;
ALTER TABLE public.outcome_consent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their own consent history"
  ON public.outcome_consent_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS outcome_consent_log_user_idx ON public.outcome_consent_log(user_id, decided_at DESC);

CREATE OR REPLACE FUNCTION public.outcome_consent_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'outcome_consent_log is append-only';
END;
$$;
CREATE TRIGGER trg_outcome_consent_log_immutable BEFORE UPDATE OR DELETE ON public.outcome_consent_log
  FOR EACH ROW EXECUTE FUNCTION public.outcome_consent_log_immutable();
REVOKE ALL ON FUNCTION public.outcome_consent_log_immutable() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_outcome_consent(p_user_id uuid, p_consent boolean, p_source text DEFAULT 'prompt')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_decided_at timestamptz := now();
BEGIN
  IF p_user_id IS NULL OR p_consent IS NULL THEN
    RAISE EXCEPTION 'set_outcome_consent needs a user and an explicit answer';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('prompt', 'settings') THEN
    RAISE EXCEPTION 'set_outcome_consent source must be prompt or settings';
  END IF;
  UPDATE public.profiles SET outcome_consent = p_consent, outcome_consent_decided_at = v_decided_at, updated_at = v_decided_at WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'no profile for %', p_user_id; END IF;
  INSERT INTO public.outcome_consent_log(user_id, consent, decided_at, source) VALUES (p_user_id, p_consent, v_decided_at, p_source);
  RETURN jsonb_build_object('consent', p_consent, 'decided_at', v_decided_at);
END;
$$;
REVOKE ALL ON FUNCTION public.set_outcome_consent(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_outcome_consent(uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.outcome_consent_state(p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('consent', p.outcome_consent, 'decided_at', p.outcome_consent_decided_at)
  FROM public.profiles p WHERE p.id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public.outcome_consent_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outcome_consent_state(uuid) TO service_role;

INSERT INTO public.schema_contract(table_name, column_name, note)
SELECT table_name, column_name, 'Outcome consent settings reader, atomic answer and immutable history'
FROM information_schema.columns
WHERE table_schema = 'public' AND (table_name = 'outcome_consent_log' OR (table_name = 'profiles' AND column_name IN ('outcome_consent', 'outcome_consent_decided_at')))
ON CONFLICT (table_name, column_name) DO NOTHING;
NOTIFY pgrst, 'reload schema';