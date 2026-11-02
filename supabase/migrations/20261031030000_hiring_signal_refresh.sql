-- Keeping hiring signals current for the leads somebody is actually working.
--
-- detect-hiring-signals had exactly one caller, enrich-lead, so a lead's job
-- board was read once in its life. Every role posted afterwards was invisible,
-- and SIGNAL_FRESHNESS_DAYS (120) meant the signal aged out of the email copy
-- with nothing replacing it. The value of "they posted this role three weeks
-- ago" is entirely that it is true this week.
--
-- Only hiring is scheduled. The other two detectors are just as stale and cost
-- money to re-run -- detect-tech-signals spends a Bloomberry credit per
-- uncached lookup, detect-news-signals a PredictLeads one -- so scheduling them
-- would spend third-party credits across a whole book of leads, which is an
-- account-level decision rather than a code one. Public ATS boards are free.

-- How stale a hiring signal may get before it is read again. Shorter than
-- SIGNAL_FRESHNESS_DAYS so a signal is refreshed while it is still usable,
-- rather than after the copy has already stopped citing it.
-- 14 days also means a board is read about twice a month, which is well inside
-- what a public endpoint will tolerate.
CREATE OR REPLACE FUNCTION public.leads_due_for_hiring_refresh(p_limit integer DEFAULT 40)
RETURNS TABLE (lead_id uuid, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH live AS (
    -- Leads with a sequence actually running. Re-polling a board for a lead
    -- nobody is emailing buys nothing, and research-lead now backfills the
    -- signal the moment somebody does pick one up.
    SELECT DISTINCT e.lead_id, e.user_id
      FROM public.sequence_enrollments e
     WHERE e.status = 'active'
  ),
  latest AS (
    -- Newest ATS signal per lead, or nothing if the board was never read.
    SELECT s.lead_id, max(s.created_at) AS last_seen
      FROM public.signal_events s
     WHERE s.source LIKE 'ats:%'
     GROUP BY s.lead_id
  ),
  due AS (
    SELECT l.lead_id,
           l.user_id,
           -- Round-robin across accounts, so one account's large book cannot
           -- own the schedule. process-rescore-queue had exactly this problem
           -- when it ordered globally by enqueued_at and one bulk import
           -- starved every other account.
           row_number() OVER (PARTITION BY l.user_id ORDER BY coalesce(t.last_seen, 'epoch'::timestamptz) ASC) AS rn,
           coalesce(t.last_seen, 'epoch'::timestamptz) AS last_seen
      FROM live l
      JOIN public.leads ld ON ld.id = l.lead_id
      LEFT JOIN latest t ON t.lead_id = l.lead_id
     WHERE (t.last_seen IS NULL OR t.last_seen < now() - interval '14 days')
       -- Nothing to look a board up by means nothing to do.
       AND (coalesce(ld.company_website, '') <> '' OR coalesce(ld.company_name, '') <> '')
  )
  SELECT due.lead_id, due.user_id
    FROM due
   ORDER BY due.rn ASC, due.last_seen ASC
   LIMIT greatest(1, least(coalesce(p_limit, 40), 200));
$$;

REVOKE ALL ON FUNCTION public.leads_due_for_hiring_refresh(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_due_for_hiring_refresh(integer) FROM anon;
REVOKE ALL ON FUNCTION public.leads_due_for_hiring_refresh(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.leads_due_for_hiring_refresh(integer) TO service_role;

COMMENT ON FUNCTION public.leads_due_for_hiring_refresh(integer) IS
  'Leads with a live sequence enrollment whose ATS hiring signal is missing or older than 14 days, round-robined across accounts. Service-role only; drained by refresh-hiring-signals.';

CREATE OR REPLACE FUNCTION public.trigger_hiring_refresh()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  config_url text;
  config_key text;
  due_ct integer;
BEGIN
  -- Nothing due means no HTTP call at all, rather than waking the function to
  -- have it discover that for itself.
  SELECT count(*) INTO due_ct FROM public.leads_due_for_hiring_refresh(1);
  IF due_ct = 0 THEN RETURN; END IF;

  SELECT setting_value->>'supabase_url' INTO config_url FROM admin_settings WHERE setting_key = 'supabase_config';
  -- refresh-hiring-signals is internal-only: the anon key is rejected, so this
  -- signs with the vault-backed internal job key, like trigger_rescore_queue.
  config_key := public.internal_job_key();
  IF config_url IS NULL OR config_key IS NULL THEN
    RAISE WARNING 'trigger_hiring_refresh: edge credentials missing; skipped';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := config_url || '/functions/v1/refresh-hiring-signals',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || config_key),
    body := jsonb_build_object('batch', 40)
  );
END;
$$;

-- Hourly. A board read twice a month per lead does not need a tighter loop,
-- and an hourly drain of 40 clears a large book over a day without ever
-- sending a burst at somebody else's careers endpoint.
SELECT cron.unschedule('refresh-hiring-signals')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-hiring-signals');
SELECT cron.schedule('refresh-hiring-signals', '17 * * * *',
  $cmd$ SELECT public.trigger_hiring_refresh(); $cmd$);
