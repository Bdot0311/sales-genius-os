DO $$
DECLARE
  v_service_key_lookup text := $sql$(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')$sql$;
BEGIN
  PERFORM cron.unschedule('lock-expired-trials-daily');
  PERFORM cron.schedule(
    'lock-expired-trials-daily',
    '0 2 * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/lock-expired-trials',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %s),
        body := jsonb_build_object('time', now())
      ) AS request_id;
    $cmd$, v_service_key_lookup)
  );

  PERFORM cron.unschedule('send-trial-warnings-daily');
  PERFORM cron.schedule(
    'send-trial-warnings-daily',
    '0 9 * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/send-trial-warnings',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %s),
        body := jsonb_build_object('time', now())
      ) AS request_id;
    $cmd$, v_service_key_lookup)
  );

  PERFORM cron.unschedule('detect-suspicious-activity-15min');
  PERFORM cron.schedule(
    'detect-suspicious-activity-15min',
    '*/15 * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/detect-suspicious-activity',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %s),
        body := '{"scheduled": true}'::jsonb
      ) AS request_id;
    $cmd$, v_service_key_lookup)
  );

  PERFORM cron.unschedule('process-scheduled-emails');
  PERFORM cron.schedule(
    'process-scheduled-emails',
    '* * * * *',
    format($cmd$
      SELECT net.http_post(
        url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/process-scheduled-emails',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %s),
        body := '{}'::jsonb
      ) AS request_id;
    $cmd$, v_service_key_lookup)
  );
END $$;

CREATE OR REPLACE FUNCTION public.notify_signup_via_edge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_key text;
BEGIN
  SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'email_queue_service_role_key'
    LIMIT 1;

  IF v_service_key IS NULL THEN
    RAISE WARNING 'notify_signup_via_edge: vault secret missing; skipping notify';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/notify-new-signup',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_service_key),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_signup_via_edge failed: %', SQLERRM;
  RETURN NEW;
END;
$$;