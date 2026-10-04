/*
 * The drafting queue could not go faster than about three drafts a minute.
 *
 * process-agent-jobs claimed eight rows and drafted them strictly one after
 * another. A draft is research plus a model call plus up to three
 * regenerations, so two to four finished inside the pass budget and the rest
 * were handed back. A hundred-lead batch took half an hour of wall clock, and
 * the user watching it could not tell a slow queue from a stopped one.
 *
 * The worker now drafts four at a time. This side of it stops the hand-back
 * costing a lead its attempts, and lets the drain keep more than one pass in
 * flight when the backlog is deep.
 */

/*
 * Give back the attempt along with the row.
 *
 * claim_agent_job_items increments attempts when it TAKES the row, not when
 * the work is done. An item returned because the pass ran out of time had
 * burned one of its three for nothing, and three passes of that had
 * release_stale_agent_job_items retire it as "Gave up after three attempts" —
 * for a lead no draft was ever attempted for.
 *
 * Only rows still held by the caller move, so a row another pass has already
 * settled is never resurrected.
 */
CREATE OR REPLACE FUNCTION public.release_agent_job_items(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE released integer;
BEGIN
  UPDATE public.agent_job_items
     SET status = 'pending',
         claimed_at = NULL,
         attempts = GREATEST(attempts - 1, 0)
   WHERE id = ANY(p_ids)
     AND status = 'claimed';
  GET DIAGNOSTICS released = ROW_COUNT;
  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_agent_job_items(uuid[]) FROM public, anon, authenticated;

/*
 * Drain deeper, and in more than one pass when there is a backlog.
 *
 * Twelve rows matches what four concurrent drafts get through inside the
 * worker's budget, so a claim is worked rather than mostly handed back. Up to
 * three passes run at once when the queue is deep: claim_agent_job_items takes
 * rows FOR UPDATE SKIP LOCKED, so overlapping passes take disjoint work.
 *
 * Capped at three on purpose. aiFetch has no backoff, and past some width the
 * provider starts refusing rather than answering — the worker now hands a
 * rate-limited row back instead of failing it, but spending the whole batch
 * discovering the ceiling helps nobody.
 */
CREATE OR REPLACE FUNCTION public.trigger_agent_jobs()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  config_url text;
  config_key text;
  pending_ct integer;
  passes     integer;
  i          integer;
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

  passes := LEAST(GREATEST(CEIL(pending_ct / 12.0)::integer, 1), 3);

  FOR i IN 1..passes LOOP
    PERFORM net.http_post(
      url := config_url || '/functions/v1/process-agent-jobs',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || config_key),
      body := jsonb_build_object('batch', 12)
    );
  END LOOP;
END;
$$;
