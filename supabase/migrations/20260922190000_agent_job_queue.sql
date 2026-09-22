-- Phase 2 of docs/AGENT_BATCH_QUEUE.md: a batch of drafting work that outlives
-- the chat turn that asked for it.
--
-- A request may chain six agent-chat passes (~11 minutes) before it stops. A
-- 79-lead batch needs more than that, and every pass re-runs the whole model
-- loop to perform work the first pass already decided. So the turn decides and
-- enqueues, and a drained worker does one lead per item.
--
-- Shaped after rescore_queue + process-rescore-queue + a pg_cron drain, which
-- is the same pattern already running here — with one correction, marked below.
-- Additive only.

CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id          uuid REFERENCES public.agent_chat_threads(id) ON DELETE SET NULL,
  agent_config_id    uuid,
  kind               text NOT NULL DEFAULT 'draft',
  request_text       text,
  -- Snapshotted at enqueue: the work runs later, and the answer to "was this
  -- allowed to send" must be the one in force when the user asked.
  autonomy           text NOT NULL DEFAULT 'approval',
  goal               text NOT NULL DEFAULT 'introduction',
  feedback           text,
  status             text NOT NULL DEFAULT 'queued',
  total              integer NOT NULL DEFAULT 0,
  done               integer NOT NULL DEFAULT 0,
  failed             integer NOT NULL DEFAULT 0,
  reported_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz,
  CONSTRAINT agent_jobs_status_check
    CHECK (status IN ('queued', 'running', 'done', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS public.agent_job_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES public.agent_jobs(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending',
  attempts      integer NOT NULL DEFAULT 0,
  draft_id      uuid,
  error         text,
  claimed_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_job_items_status_check
    CHECK (status IN ('pending', 'claimed', 'done', 'failed', 'skipped'))
);

-- One row per lead per job, so a retried enqueue cannot double the batch.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_job_items_job_lead
  ON public.agent_job_items(job_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_agent_job_items_claimable
  ON public.agent_job_items(job_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_job_items_pending
  ON public.agent_job_items(status, created_at) WHERE status IN ('pending', 'claimed');
CREATE INDEX IF NOT EXISTS idx_agent_jobs_open
  ON public.agent_jobs(status, created_at) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_agent_jobs_thread ON public.agent_jobs(thread_id, created_at DESC);

-- PostgREST grants: the app reads its own jobs; all writes are service role.
GRANT SELECT, UPDATE ON public.agent_jobs TO authenticated;
GRANT SELECT ON public.agent_job_items TO authenticated;
GRANT ALL ON public.agent_jobs TO service_role;
GRANT ALL ON public.agent_job_items TO service_role;

ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_job_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_jobs_select_own" ON public.agent_jobs;
CREATE POLICY "agent_jobs_select_own" ON public.agent_jobs
  FOR SELECT USING (auth.uid() = user_id);

-- Cancelling is the one write a user makes directly, and it is the thing that
-- makes a runaway batch survivable, so it ships with the queue rather than
-- after it. Narrowed to the cancelled state: a client cannot mark work done.
DROP POLICY IF EXISTS "agent_jobs_cancel_own" ON public.agent_jobs;
CREATE POLICY "agent_jobs_cancel_own" ON public.agent_jobs
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

DROP POLICY IF EXISTS "agent_job_items_select_own" ON public.agent_job_items;
CREATE POLICY "agent_job_items_select_own" ON public.agent_job_items
  FOR SELECT USING (auth.uid() = user_id);

-- Inserts and progress writes happen with the service role only.

/*
 * Claiming a batch.
 *
 * This is where process-rescore-queue must NOT be copied. It selects
 * `status = 'pending'` and processes, with no compare-and-set, so two
 * overlapping drains can take the same row. For a rescore that wastes a
 * recompute. For work that ends in an email it is a duplicate.
 *
 * `FOR UPDATE SKIP LOCKED` is the whole difference: concurrent callers get
 * disjoint sets, and neither waits on the other.
 */
CREATE OR REPLACE FUNCTION public.claim_agent_job_items(p_limit integer DEFAULT 8)
RETURNS SETOF public.agent_job_items
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.agent_job_items i
     SET status = 'claimed', claimed_at = now(), attempts = i.attempts + 1
   WHERE i.id IN (
     SELECT c.id
       FROM public.agent_job_items c
       JOIN public.agent_jobs j ON j.id = c.job_id
      WHERE c.status = 'pending'
        AND j.status IN ('queued', 'running')
      ORDER BY c.created_at
      LIMIT GREATEST(p_limit, 1)
      FOR UPDATE OF c SKIP LOCKED
   )
  RETURNING i.*;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_job_items(integer) FROM public, anon, authenticated;

/*
 * A claim that was never finished.
 *
 * The worker can die mid-item — the same way an agent-chat turn can — and a row
 * stuck in 'claimed' would never be picked up again. Ten minutes is well past
 * the worker's own budget, and the same idea as the twenty-minute staleness
 * fence agent-chat already applies to run_status.
 */
CREATE OR REPLACE FUNCTION public.release_stale_agent_job_items()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE released integer;
BEGIN
  UPDATE public.agent_job_items
     SET status = 'pending', claimed_at = NULL
   WHERE status = 'claimed'
     AND claimed_at < now() - interval '10 minutes'
     -- Three attempts is enough to tell a hiccup from a lead that cannot be
     -- drafted for. Past that it is a failure with a reason, not a retry.
     AND attempts < 3;
  GET DIAGNOSTICS released = ROW_COUNT;

  UPDATE public.agent_job_items
     SET status = 'failed',
         error = COALESCE(error, 'Gave up after three attempts'),
         finished_at = now()
   WHERE status = 'claimed'
     AND claimed_at < now() - interval '10 minutes'
     AND attempts >= 3;

  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_agent_job_items() FROM public, anon, authenticated;

-- Drain: called by pg_cron, posts to the edge function. Mirrors
-- trigger_rescore_queue, including the early return when nothing is pending so
-- an idle queue costs nothing.
CREATE OR REPLACE FUNCTION public.trigger_agent_jobs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  config_url text;
  config_key text;
  pending_ct integer;
BEGIN
  PERFORM public.release_stale_agent_job_items();

  SELECT count(*) INTO pending_ct
    FROM public.agent_job_items i
    JOIN public.agent_jobs j ON j.id = i.job_id
   WHERE i.status = 'pending' AND j.status IN ('queued', 'running');
  IF pending_ct = 0 THEN RETURN; END IF;

  SELECT setting_value->>'supabase_url' INTO config_url FROM admin_settings WHERE setting_key = 'supabase_config';
  -- process-agent-jobs is internal-only: the anon key is rejected, so the drain
  -- signs with the vault-backed internal job key, like trigger_rescore_queue.
  config_key := public.internal_job_key();
  IF config_url IS NULL OR config_key IS NULL THEN
    RAISE WARNING 'trigger_agent_jobs: edge credentials missing; skipped';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := config_url || '/functions/v1/process-agent-jobs',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || config_key),
    body := jsonb_build_object('batch', 8)
  );
END;
$$;

-- Every minute: a batch the user is waiting on should not sit for five.
SELECT cron.unschedule('process-agent-jobs')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-agent-jobs');
SELECT cron.schedule('process-agent-jobs', '* * * * *',
  $cmd$ SELECT public.trigger_agent_jobs(); $cmd$);
