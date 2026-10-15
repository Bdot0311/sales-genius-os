-- Five scheduled jobs have been answering 401 and nobody was watching.
--
-- A cron job that calls an edge function has to sign the call with something
-- the function accepts. Most of these do: they read the service role key out
-- of the vault, the pattern blacklist-sweep, dispatch-sequence-steps,
-- lock-expired-trials, process-scheduled-emails, send-activation-nudges,
-- send-re-engagement-emails, send-trial-warnings and import-tech-accounts all
-- use. Five instead pass the project's ANON key as the bearer token, and the
-- functions they call compare the bearer against SUPABASE_SERVICE_ROLE_KEY:
--
--   audit-free-tier-emails    service role, or a real signed-in user
--   run-scheduled-imports     service role, or a real signed-in user
--   run-seo-audit             token !== SERVICE_ROLE -> 401   (two jobs)
--   send-seo-digest           token !== serviceKey   -> 401
--
-- The anon key is neither, so every one of these has been rejected on every
-- run. There is no alert on it: pg_cron records the POST as sent, the 401 is
-- the response body, and the work silently never happens. The free-tier audit
-- has not run daily, scheduled imports have not run hourly, and the SEO crawl,
-- perf run and digest have not run at all.
--
-- retry-stripe-webhooks is left alone deliberately: it explicitly accepts the
-- anon key as well as the service key, so its job is correct as written.
-- dispatch-webhooks is also left alone — it has no in-function check and
-- relies on verify_jwt, which the anon key satisfies.
--
-- Schedules and bodies are unchanged. Only the Authorization header moves to
-- the vault secret the working jobs already use.
--
-- That secret is read here under its honest name, internal_trigger_secret.
-- It has been called email_queue_service_role_key since it was created and has
-- never held the service role key. The migration immediately before this one
-- creates the new name from the old value and repoints every other job at it,
-- so the name is already there when these five are written.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; skipping cron auth fix';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'audit-free-tier-emails-daily',
    '25 5 * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/audit-free-tier-emails',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret')),
      body := '{"limit": 1000}'::jsonb
    ) AS request_id;
    $job$
  );

  PERFORM cron.schedule(
    'run-scheduled-imports-hourly',
    '35 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/run-scheduled-imports',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret')),
      body := '{}'::jsonb
    ) AS request_id;
    $job$
  );

  PERFORM cron.schedule(
    'seo-audit-crawl-weekly',
    '15 3 * * 1',
    $job$
    SELECT net.http_post(
      url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/run-seo-audit',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret')),
      body := '{"mode":"both"}'::jsonb
    ) AS request_id;
    $job$
  );

  PERFORM cron.schedule(
    'seo-audit-perf-daily',
    '30 3 * * *',
    $job$
    SELECT net.http_post(
      url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/run-seo-audit',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret')),
      body := '{"mode":"perf"}'::jsonb
    ) AS request_id;
    $job$
  );

  PERFORM cron.schedule(
    'seo-digest-weekly',
    '12 9 * * 1',
    $job$
    SELECT net.http_post(
      url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/send-seo-digest',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_trigger_secret')),
      body := '{}'::jsonb
    ) AS request_id;
    $job$
  );
END $$;
