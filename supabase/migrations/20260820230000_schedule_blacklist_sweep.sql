-- Schedule the nightly blacklist sweep.
--
-- check-blacklists only ever ran when a user pressed the button in the
-- deliverability dashboard. But deliverability-alerts-scan raises its blacklist
-- alerts by reading the blacklist_checks table — so nothing was checked unless
-- a human remembered to, and the nightly scan re-reported whatever was last
-- checked by hand. A domain listed on Saturday stayed unreported until someone
-- happened to look at it.
--
-- 05:45 UTC, half an hour ahead of deliverability-alerts-scan at 06:15, so the
-- alerts it raises are drawn from results measured minutes earlier rather than
-- from whenever a user last clicked. Off the hour so it does not queue behind
-- every other job scheduled at :00.

DO $$
BEGIN
  PERFORM cron.unschedule('blacklist-sweep-daily');
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
    'blacklist-sweep-daily',
    '45 5 * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/blacklist-sweep',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %s),
        body := '{"scheduled": true}'::jsonb
      ) AS request_id;
    $cmd$, v_service_key_lookup)
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron or vault unavailable in this environment. The function is still
  -- callable directly; not worth failing the migration over.
  RAISE NOTICE 'blacklist-sweep not scheduled: %', SQLERRM;
END;
$$;
