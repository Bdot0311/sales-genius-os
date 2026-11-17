CREATE TABLE public.bulk_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_config_id uuid,
  name text NOT NULL DEFAULT 'Bulk research and drafting',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  do_research boolean NOT NULL DEFAULT true,
  do_draft boolean NOT NULL DEFAULT true,
  goal text NOT NULL DEFAULT 'introduction',
  feedback text,
  status text NOT NULL DEFAULT 'awaiting_approval'
    CHECK (status IN ('awaiting_approval','running','paused','cancelled','completed')),
  pause_reason text,
  matched_count integer NOT NULL DEFAULT 0,
  estimate jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_leads integer,
  approved_at timestamptz,
  cursor_created_at timestamptz,
  cursor_id uuid,
  feed_exhausted boolean NOT NULL DEFAULT false,
  enqueued integer NOT NULL DEFAULT 0,
  researched integer NOT NULL DEFAULT 0,
  drafted integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  consecutive_rate_limits integer NOT NULL DEFAULT 0,
  rate_limited_until timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
GRANT SELECT ON public.bulk_runs TO authenticated;
GRANT ALL ON public.bulk_runs TO service_role;
ALTER TABLE public.bulk_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners view their bulk runs" ON public.bulk_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_bulk_runs_user ON public.bulk_runs (user_id, created_at DESC);
CREATE INDEX idx_bulk_runs_running ON public.bulk_runs (status) WHERE status = 'running';

CREATE TABLE public.bulk_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.bulk_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  stage text NOT NULL DEFAULT 'pending' CHECK (stage IN ('pending','claimed','done','skipped','failed')),
  research_done boolean NOT NULL DEFAULT false,
  draft_id uuid,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  error text,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, lead_id)
);
GRANT SELECT ON public.bulk_run_items TO authenticated;
GRANT ALL ON public.bulk_run_items TO service_role;
ALTER TABLE public.bulk_run_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners view their bulk run items" ON public.bulk_run_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_bulk_run_items_claim ON public.bulk_run_items (run_id, next_attempt_at) WHERE stage = 'pending';
CREATE INDEX idx_bulk_run_items_claimed ON public.bulk_run_items (claimed_at) WHERE stage = 'claimed';
CREATE INDEX IF NOT EXISTS idx_leads_user_created_id ON public.leads (user_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.acquire_bulk_run_lease(p_run uuid, p_seconds integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tok uuid := gen_random_uuid();
BEGIN
  UPDATE public.bulk_runs SET lease_until = now() + make_interval(secs => p_seconds), lease_token = tok, updated_at = now()
   WHERE id = p_run AND status = 'running'
     AND (lease_until IS NULL OR lease_until < now())
     AND (rate_limited_until IS NULL OR rate_limited_until < now());
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN tok;
END $$;

CREATE OR REPLACE FUNCTION public.release_bulk_run_lease(p_run uuid, p_token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.bulk_runs SET lease_until = NULL, lease_token = NULL, updated_at = now()
   WHERE id = p_run AND lease_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.claim_bulk_run_items(p_run uuid, p_limit integer)
RETURNS SETOF public.bulk_run_items LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.bulk_run_items i SET stage = 'claimed', claimed_at = now(), attempts = i.attempts + 1
   WHERE i.id IN (
     SELECT id FROM public.bulk_run_items
      WHERE run_id = p_run AND stage = 'pending' AND next_attempt_at <= now()
      ORDER BY next_attempt_at LIMIT p_limit FOR UPDATE SKIP LOCKED)
  RETURNING i.*;
$$;

CREATE OR REPLACE FUNCTION public.bump_bulk_run(p_run uuid, p_researched integer, p_drafted integer, p_skipped integer, p_failed integer)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.bulk_runs SET researched = researched + p_researched, drafted = drafted + p_drafted,
    skipped = skipped + p_skipped, failed = failed + p_failed, updated_at = now() WHERE id = p_run;
$$;

CREATE OR REPLACE FUNCTION public.trigger_bulk_runs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE config_url text; config_key text; r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bulk_runs WHERE status = 'running') THEN RETURN; END IF;
  UPDATE public.bulk_run_items SET stage = 'pending', claimed_at = NULL
   WHERE stage = 'claimed' AND claimed_at < now() - interval '15 minutes';
  SELECT setting_value->>'supabase_url' INTO config_url FROM admin_settings WHERE setting_key = 'supabase_config';
  config_key := public.internal_job_key();
  IF config_url IS NULL OR config_key IS NULL THEN RETURN; END IF;
  FOR r IN SELECT id FROM public.bulk_runs
            WHERE status = 'running' AND (lease_until IS NULL OR lease_until < now())
              AND (rate_limited_until IS NULL OR rate_limited_until < now())
            ORDER BY updated_at LIMIT 10 LOOP
    PERFORM net.http_post(
      url := config_url || '/functions/v1/process-bulk-runs',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || config_key),
      body := jsonb_build_object('run_id', r.id));
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.trigger_agent_jobs()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  config_url text; config_key text; pending_ct integer; passes integer; i integer;
BEGIN
  BEGIN
    PERFORM public.trigger_bulk_runs();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'trigger_bulk_runs failed: %', SQLERRM;
  END;

  PERFORM public.release_stale_agent_job_items();

  SELECT count(*) INTO pending_ct
    FROM public.agent_job_items i
    JOIN public.agent_jobs j ON j.id = i.job_id
   WHERE i.status = 'pending' AND j.status IN ('queued', 'running');
  IF pending_ct = 0 THEN RETURN; END IF;

  SELECT setting_value->>'supabase_url' INTO config_url FROM admin_settings WHERE setting_key = 'supabase_config';
  config_key := public.internal_job_key();
  IF config_url IS NULL OR config_key IS NULL THEN
    RAISE WARNING 'trigger_agent_jobs: edge credentials missing; skipped';
    RETURN;
  END IF;

  passes := LEAST(GREATEST(CEIL(pending_ct / 12.0)::integer, 1), 3);
  FOR i IN 1..passes LOOP
    PERFORM net.http_post(
      url := config_url || '/functions/v1/process-agent-jobs',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || config_key),
      body := jsonb_build_object('batch', 12)
    );
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.acquire_bulk_run_lease(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_bulk_run_lease(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_bulk_run_items(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_bulk_run(uuid, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_bulk_runs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_bulk_run_lease(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_bulk_run_lease(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_bulk_run_items(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_bulk_run(uuid, integer, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_bulk_runs() TO service_role;

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT t, c, 'bulk outreach runs' FROM (VALUES
  ('bulk_runs','status'),('bulk_runs','filters'),('bulk_runs','max_leads'),('bulk_runs','cursor_created_at'),
  ('bulk_runs','cursor_id'),('bulk_runs','lease_until'),('bulk_runs','rate_limited_until'),
  ('bulk_run_items','stage'),('bulk_run_items','next_attempt_at'),('bulk_run_items','research_done')) v(t,c);