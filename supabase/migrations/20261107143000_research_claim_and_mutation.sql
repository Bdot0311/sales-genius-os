-- Reserve a research run before any provider call, and record a mutating
-- tool as dispatching before it runs so a crash cannot replay it.

CREATE OR REPLACE FUNCTION public.begin_research_run(
  p_user_id uuid,
  p_lead_id uuid,
  p_force boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing uuid;
  created uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_lead_id::text, 0));
  IF NOT p_force THEN
    SELECT id INTO existing
    FROM public.research_runs
    WHERE user_id = p_user_id AND lead_id = p_lead_id
      AND attempted_at > now() - interval '10 minutes'
    ORDER BY attempted_at DESC
    LIMIT 1;
    IF existing IS NOT NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  INSERT INTO public.research_runs (user_id, lead_id, receipt)
  VALUES (p_user_id, p_lead_id, '{"status":"started"}'::jsonb)
  RETURNING id INTO created;
  RETURN created;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_research_run(uuid, uuid, boolean) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.begin_research_run(uuid, uuid, boolean) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.begin_research_run(uuid, uuid, boolean) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.begin_research_run(uuid, uuid, boolean) TO service_role';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.store_research_snapshots(
  p_user_id uuid,
  p_lead_id uuid,
  p_rows jsonb,
  p_receipt jsonb,
  p_run_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_lead_id::text, 0));
  IF jsonb_typeof(p_rows) = 'array' AND jsonb_array_length(p_rows) > 0 THEN
    DELETE FROM public.research_snapshots WHERE user_id = p_user_id AND lead_id = p_lead_id;
    INSERT INTO public.research_snapshots (user_id, lead_id, payload)
    SELECT p_user_id, p_lead_id, value FROM jsonb_array_elements(p_rows);
  END IF;
  UPDATE public.research_runs
  SET receipt = COALESCE(p_receipt, '{}'::jsonb)
  WHERE id = p_run_id AND user_id = p_user_id AND lead_id = p_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION public.store_research_snapshots(uuid, uuid, jsonb, jsonb, uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.store_research_snapshots(uuid, uuid, jsonb, jsonb, uuid) TO service_role';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_run_mutations'
  ) THEN
    ALTER TABLE public.agent_run_mutations
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'agent_run_mutations_status_check'
    ) THEN
      ALTER TABLE public.agent_run_mutations
        ADD CONSTRAINT agent_run_mutations_status_check
        CHECK (status IN ('dispatching', 'completed', 'unknown'));
    END IF;
  END IF;
END $$;
