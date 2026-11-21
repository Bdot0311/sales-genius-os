-- Mirror of drizzle/migrations/0078_agent_job_retry_backoff.sql.
-- A throttled draft was put straight back to pending, and the cron fired three
-- workers in the same minute, so the three attempts a lead is allowed were
-- spent inside one Bedrock throttle window. not_before is how the next claim
-- waits. The claim itself is the 0039 fair-queue function plus that predicate.

ALTER TABLE public.agent_job_items
  ADD COLUMN IF NOT EXISTS not_before timestamptz;

COMMENT ON COLUMN public.agent_job_items.not_before IS
  'claim_agent_job_items leaves a pending row alone until this time. Rate limits, scorer timeouts and a draft waiting on its research job set it.';

CREATE INDEX IF NOT EXISTS idx_agent_job_items_not_before
  ON public.agent_job_items (not_before)
  WHERE status = 'pending' AND not_before IS NOT NULL;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('agent_job_items', 'not_before', 'Earliest time a pending agent job item may be claimed again')
ON CONFLICT (table_name, column_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_agent_job_items(p_limit integer DEFAULT 8)
RETURNS SETOF public.agent_job_items
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH tenants AS (
    SELECT c.user_id, min(c.created_at) AS oldest
      FROM public.agent_job_items c
      JOIN public.agent_jobs j ON j.id = c.job_id
     WHERE c.status = 'pending'
       AND (c.not_before IS NULL OR c.not_before <= now())
       AND j.status IN ('queued', 'running')
     GROUP BY c.user_id
  ),
  seated AS (
    SELECT t.user_id,
           row_number() OVER (
             ORDER BY CASE
                        WHEN r.last_served_at > now() - interval '10 minutes'
                          THEN r.served_count
                        ELSE 0
                      END,
                      t.oldest,
                      t.user_id
           ) AS seat
      FROM tenants t
      LEFT JOIN public.queue_tenant_turn r
        ON r.queue = 'agent_job_items' AND r.user_id = t.user_id
  ),
  candidates AS (
    SELECT x.id,
           row_number() OVER (ORDER BY x.turn, s.seat, x.id) AS ord
      FROM seated s
     CROSS JOIN LATERAL (
       SELECT c.id,
              row_number() OVER (ORDER BY c.created_at, c.id) AS turn
         FROM public.agent_job_items c
         JOIN public.agent_jobs j ON j.id = c.job_id
        WHERE c.status = 'pending'
          AND (c.not_before IS NULL OR c.not_before <= now())
          AND c.user_id = s.user_id
          AND j.status IN ('queued', 'running')
        ORDER BY c.created_at, c.id
        LIMIT GREATEST(p_limit, 1) * 8
     ) x
  ),
  locked AS (
    SELECT c.id
      FROM public.agent_job_items c
      JOIN candidates cd ON cd.id = c.id
     WHERE c.status = 'pending'
       AND (c.not_before IS NULL OR c.not_before <= now())
     ORDER BY cd.ord
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE OF c SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.agent_job_items i
       SET status = 'claimed', claimed_at = now(), attempts = i.attempts + 1
     WHERE i.id IN (SELECT id FROM locked)
    RETURNING i.*
  ),
  served AS (
    INSERT INTO public.queue_tenant_turn AS q (queue, user_id, served_count, last_served_at)
    SELECT 'agent_job_items', u.user_id, u.rows_claimed, clock_timestamp()
      FROM (SELECT user_id, count(*) AS rows_claimed FROM claimed GROUP BY user_id) u
    ON CONFLICT (queue, user_id) DO UPDATE
       SET served_count = CASE
                            WHEN q.last_served_at > clock_timestamp() - interval '10 minutes'
                              THEN q.served_count + excluded.served_count
                            ELSE excluded.served_count
                          END,
           last_served_at = clock_timestamp()
    RETURNING 1
  )
  SELECT * FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_job_items(integer) FROM public, anon, authenticated;

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
   WHERE i.status = 'pending'
     AND (i.not_before IS NULL OR i.not_before <= now())
     AND j.status IN ('queued', 'running');
  IF pending_ct = 0 THEN RETURN; END IF;

  SELECT setting_value->>'supabase_url' INTO config_url FROM admin_settings WHERE setting_key = 'supabase_config';
  config_key := public.internal_job_key();
  IF config_url IS NULL OR config_key IS NULL THEN
    RAISE WARNING 'trigger_agent_jobs: edge credentials missing; skipped';
    RETURN;
  END IF;

  -- Two passes, not three. Each pass runs two leads at a time, so the burst
  -- stays at the size one worker used to be instead of three times that.
  passes := LEAST(GREATEST(CEIL(pending_ct / 8.0)::integer, 1), 2);
  FOR i IN 1..passes LOOP
    PERFORM net.http_post(
      url := config_url || '/functions/v1/process-agent-jobs',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || config_key),
      body := jsonb_build_object('batch', 8)
    );
  END LOOP;
END;
$function$;
