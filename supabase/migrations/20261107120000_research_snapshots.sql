-- Service-written retrieval rows. A lead's research_brief is owner-writable,
-- so a hash stored there cannot prove a provider fetched the page.
-- authenticated can read its own rows and cannot insert, update, or delete.

CREATE TABLE IF NOT EXISTS public.research_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS research_snapshots_lead_idx
  ON public.research_snapshots (user_id, lead_id, created_at DESC);

ALTER TABLE public.research_snapshots ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON TABLE public.research_snapshots FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.research_snapshots FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.research_snapshots FROM authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.research_snapshots TO authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.research_snapshots TO service_role';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'uid' AND pronamespace = 'auth'::regnamespace) THEN
    EXECUTE $policy$
      CREATE POLICY research_snapshots_owner_read ON public.research_snapshots
        FOR SELECT TO authenticated
        USING (user_id = auth.uid())
    $policy$;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
