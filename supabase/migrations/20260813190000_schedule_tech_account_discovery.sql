-- Bring in accounts that just dropped a tool the user displaces.
--
-- A company that stopped running a competitor last week is in a buying window
-- now, and a window nobody happens to look through is worth nothing. This runs
-- daily against the competitor list already set on each user's ICP
-- (icp_profiles.exclude_tech_stack) and adds the accounts it finds.
--
-- There is no interface for this on purpose. The signal reaches the user twice,
-- both times inside something they were already looking at: the account appears
-- in their account list, and once a lead there is enriched,
-- detect-tech-signals writes a tech_stack_change row to signal_events — which
-- is what the intent score beside the ICP score is computed from.
--
-- Daily rather than hourly because the underlying data moves in days, and the
-- provider meters technographics by results returned, so a tighter schedule
-- would spend more to learn the same thing.

DO $$
DECLARE
  v_service_key_lookup text :=
    $sql$(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')$sql$;
BEGIN
  PERFORM cron.unschedule('import-tech-accounts-daily');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END;
$$;

DO $$
DECLARE
  v_service_key_lookup text :=
    $sql$(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')$sql$;
BEGIN
  PERFORM cron.schedule(
    'import-tech-accounts-daily',
    -- 06:20 UTC. Off the hour so it does not queue behind every other job
    -- scheduled at :00, and before the working day in the US and Europe.
    '20 6 * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/import-tech-accounts',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %s),
        body := '{"scheduled": true}'::jsonb
      ) AS request_id;
    $cmd$, v_service_key_lookup)
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron or vault unavailable here. The function is still callable directly;
  -- not worth failing the migration over.
  RAISE NOTICE 'import-tech-accounts not scheduled: %', SQLERRM;
END;
$$;
