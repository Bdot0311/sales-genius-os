-- Sequences never sent. Every enrollment sat still, forever.
--
-- A customer enrolled five verified leads into an active sequence over MCP.
-- Every call returned success with a real id, status active, current_step 0.
-- After an hour and three quarters: nothing sent, no agent activity, and the
-- sequence UI still reading zero enrolled.
--
-- The enrollments were fine. The chain that acts on them was missing a link:
--
--   enroll  ->  [NOTHING]  ->  process-sequence-step  ->  sent_emails('scheduled')
--                                                      -> process-scheduled-emails (cron)
--                                                      -> send-email
--
-- process-sequence-step is correct and deployed, and it only ever runs for one
-- enrollment id handed to it. Nothing in the codebase handed it one — no cron,
-- no edge function, no frontend call. Nineteen cron jobs existed and not one
-- advanced a sequence.
--
-- So this is not an MCP bug. Every enrollment path was equally dead: the UI,
-- the AI SDR's enroll_lead_in_sequence, the playbook's scheduleFollowUps, and
-- MCP. They all wrote a correct row into the correct table and nothing ever
-- read it.
--
-- Two fixes here. The dispatcher gets a schedule, and the counter the UI reads
-- gets maintained.

-- =============================================================
-- 1. Run the dispatcher.
-- =============================================================
--
-- Every five minutes rather than every minute: a step's own delay is measured
-- in days, so minute-level precision buys nothing, and each pass fans out to
-- process-sequence-step for up to two hundred enrollments.
DO $$
DECLARE
  v_service_key_lookup text := $sql$(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')$sql$;
BEGIN
  PERFORM cron.unschedule('dispatch-sequence-steps');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet, which is the point
END $$;

DO $$
DECLARE
  v_service_key_lookup text := $sql$(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')$sql$;
BEGIN
  PERFORM cron.schedule(
    'dispatch-sequence-steps',
    '*/5 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/dispatch-sequence-steps',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %s),
        body := '{"scheduled": true}'::jsonb
      ) AS request_id;
    $cmd$, v_service_key_lookup)
  );
END $$;


-- =============================================================
-- 2. Keep the number the UI shows.
-- =============================================================
--
-- SequenceBuilder and SequencesList both render
-- email_sequences.total_enrollments, and nothing in the codebase ever
-- incremented it. So even once dispatch works, an enrolled sequence would
-- still have displayed "0 enrolled" — which is exactly what the customer
-- reported alongside the silence, and is a separate bug that would have
-- outlived the first fix.
--
-- A trigger rather than an increment at each call site, for the same reason
-- the rest of this codebase uses them: there are four paths that enroll and a
-- fifth will be written eventually.
CREATE OR REPLACE FUNCTION public.sync_sequence_enrollment_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sequence_id uuid;
BEGIN
  v_sequence_id := COALESCE(NEW.sequence_id, OLD.sequence_id);
  IF v_sequence_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Counted from the rows rather than adjusted by a delta. A counter nudged
  -- up and down drifts the first time a write is missed or replayed, and the
  -- drift is invisible; a recount is always right and this table is small.
  UPDATE public.email_sequences s
  SET
    total_enrollments = (
      SELECT count(*) FROM public.sequence_enrollments e
      WHERE e.sequence_id = v_sequence_id
    ),
    total_completed = (
      SELECT count(*) FROM public.sequence_enrollments e
      WHERE e.sequence_id = v_sequence_id AND e.status = 'completed'
    ),
    updated_at = now()
  WHERE s.id = v_sequence_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sequence_enrollment_counts ON public.sequence_enrollments;
CREATE TRIGGER trg_sequence_enrollment_counts
  AFTER INSERT OR UPDATE OF status OR DELETE ON public.sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sequence_enrollment_counts();

COMMENT ON FUNCTION public.sync_sequence_enrollment_counts() IS
  'Maintains email_sequences.total_enrollments / total_completed, which the sequence UI reads and which nothing incremented before. Recounts rather than adjusting a delta so a missed or replayed write cannot silently drift it.';


-- =============================================================
-- 3. Correct what is already there.
-- =============================================================
--
-- Existing enrollments predate the trigger, so their sequences still read
-- zero. Backfilled once here; the trigger keeps them right from now on.
UPDATE public.email_sequences s
SET
  total_enrollments = c.total,
  total_completed = c.completed
FROM (
  SELECT
    sequence_id,
    count(*) AS total,
    count(*) FILTER (WHERE status = 'completed') AS completed
  FROM public.sequence_enrollments
  GROUP BY sequence_id
) c
WHERE s.id = c.sequence_id
  AND (s.total_enrollments IS DISTINCT FROM c.total
    OR s.total_completed IS DISTINCT FROM c.completed);
