-- The cooldown and the snapshot replace are service-written.
-- An owner can edit leads.research_brief. They cannot insert a run or a snapshot.

CREATE TABLE IF NOT EXISTS public.research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  receipt jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS research_runs_lead_idx
  ON public.research_runs (user_id, lead_id, attempted_at DESC);

ALTER TABLE public.research_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON TABLE public.research_runs FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.research_runs FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.research_runs FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.research_runs TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.research_runs TO service_role';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uid' AND pronamespace = 'auth'::regnamespace) THEN
    EXECUTE $policy$
      CREATE POLICY research_runs_owner_read ON public.research_runs
        FOR SELECT TO authenticated
        USING (user_id = auth.uid())
    $policy$;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.replace_research_snapshots(
  p_user_id uuid,
  p_lead_id uuid,
  p_rows jsonb,
  p_receipt jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_lead_id::text, 0));
  DELETE FROM public.research_snapshots WHERE user_id = p_user_id AND lead_id = p_lead_id;
  INSERT INTO public.research_snapshots (user_id, lead_id, payload)
  SELECT p_user_id, p_lead_id, value
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb));
  INSERT INTO public.research_runs (user_id, lead_id, receipt)
  VALUES (p_user_id, p_lead_id, COALESCE(p_receipt, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.replace_research_snapshots(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.replace_research_snapshots(uuid, uuid, jsonb, jsonb) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.replace_research_snapshots(uuid, uuid, jsonb, jsonb) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.replace_research_snapshots(uuid, uuid, jsonb, jsonb) TO service_role';
  END IF;
END $$;
