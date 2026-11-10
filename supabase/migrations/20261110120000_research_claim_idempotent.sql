-- Idempotent repair for hosted databases that applied
-- 20261107143000 before this block created the table, or that created
-- agent_run_mutations from Drizzle without the status column.
-- Also (re)installs begin_research_run and store_research_snapshots, which
-- that migration creates. A database that never ran it is missing both
-- functions, and research-lead used to treat that failure as "already ran".

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
  IF to_regclass('public.agent_chat_threads') IS NOT NULL
     AND to_regclass('public.agent_run_mutations') IS NULL THEN
    CREATE TABLE public.agent_run_mutations (
      thread_id UUID NOT NULL REFERENCES public.agent_chat_threads(id) ON DELETE CASCADE,
      user_id UUID NOT NULL,
      mutation_key TEXT NOT NULL,
      tool_name TEXT,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (thread_id, mutation_key),
      CONSTRAINT agent_run_mutations_status_check
        CHECK (status IN ('dispatching', 'completed', 'unknown'))
    );
    ALTER TABLE public.agent_run_mutations ENABLE ROW LEVEL SECURITY;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'GRANT SELECT ON public.agent_run_mutations TO authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE 'GRANT ALL ON public.agent_run_mutations TO service_role';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'agent_run_mutations'
        AND policyname = 'Users can view their own agent run mutations'
    ) THEN
      CREATE POLICY "Users can view their own agent run mutations"
        ON public.agent_run_mutations FOR SELECT TO authenticated
        USING (auth.uid() = user_id);
    END IF;
  END IF;

  IF to_regclass('public.agent_run_mutations') IS NOT NULL THEN
    ALTER TABLE public.agent_run_mutations
      ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';
    UPDATE public.agent_run_mutations SET status = 'completed' WHERE status IS NULL;
    ALTER TABLE public.agent_run_mutations ALTER COLUMN status SET DEFAULT 'completed';
    ALTER TABLE public.agent_run_mutations ALTER COLUMN status SET NOT NULL;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'agent_run_mutations_status_check'
    ) THEN
      ALTER TABLE public.agent_run_mutations
        ADD CONSTRAINT agent_run_mutations_status_check
        CHECK (status IN ('dispatching', 'completed', 'unknown'));
    END IF;
  END IF;
END $$;
