-- Rescore every existing lead.
--
-- icp_score and intent_score used to be written by two different scorers with
-- two different meanings. The v1 scorer put one blend of fit, contact quality
-- and data freshness into both columns, so the two badges shown side by side
-- carried the same number and neither reflected a buying signal; the v2 scorer
-- wrote a signal-aware intent, but only on paid plans and only for leads
-- enriched after it existed.
--
-- Both now come from one place. The rows written before that still hold the old
-- values, and nothing rewrites them on its own: a lead is only rescored when a
-- new signal fires or its ICP changes. Without this backfill a lead sits on its
-- old blend indefinitely, and after the switch its icp_score is simply whatever
-- the last scorer to touch it happened to leave there.
--
-- This enqueues rather than computes. The scoring engine is TypeScript
-- (_shared/lead-scoring.ts) and reimplementing it in SQL would be a second
-- copy to keep in step, which is the exact failure being cleaned up here. The
-- existing rescore_queue already drains through process-rescore-queue on a
-- five-minute pg_cron job at 50 leads a pass, so this hands the work to the
-- machinery that already does it correctly and returns immediately.
--
-- No signal detection runs as part of this, so it costs no provider credits.
-- Leads enriched before the tech, funding and hiring detectors existed have no
-- signal_events and will score on fit and the quality baseline alone, which is
-- the honest answer for a lead nothing has been observed about. They pick up
-- real intent the next time they are enriched.

INSERT INTO public.rescore_queue (user_id, lead_id, reason)
SELECT l.user_id, l.id, 'backfill_score_ownership'
  FROM public.leads l
 WHERE l.user_id IS NOT NULL
-- A lead already waiting keeps its place; the partial unique index on
-- (lead_id) WHERE status = 'pending' is what makes this safe to re-run.
ON CONFLICT DO NOTHING;

-- Drain faster while the backlog clears, then the five-minute job takes over.
-- Unschedule first so re-running the migration does not stack duplicate jobs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-rescore-queue-backfill') THEN
    PERFORM cron.unschedule('process-rescore-queue-backfill');
  END IF;
  PERFORM cron.schedule('process-rescore-queue-backfill', '* * * * *',
    $cmd$ SELECT public.trigger_rescore_queue(); $cmd$);
EXCEPTION WHEN OTHERS THEN
  -- pg_cron missing or not permitted here: the regular five-minute job still
  -- drains the queue, just more slowly. Not worth failing the migration over.
  RAISE NOTICE 'backfill drain job not scheduled: %', SQLERRM;
END;
$$;

-- Retire the accelerated job once the queue is empty, so it does not run at one
-- minute forever. Checked by the same job it cancels.
CREATE OR REPLACE FUNCTION public.retire_rescore_backfill_job()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.rescore_queue WHERE status = 'pending') THEN
    PERFORM cron.unschedule('process-rescore-queue-backfill');
    -- And retire the watcher itself, or it polls an empty queue forever for a
    -- backfill that finished once.
    PERFORM cron.unschedule('retire-rescore-backfill');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'could not retire backfill drain job: %', SQLERRM;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retire-rescore-backfill') THEN
    PERFORM cron.unschedule('retire-rescore-backfill');
  END IF;
  PERFORM cron.schedule('retire-rescore-backfill', '*/10 * * * *',
    $cmd$ SELECT public.retire_rescore_backfill_job(); $cmd$);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'retire job not scheduled: %', SQLERRM;
END;
$$;
