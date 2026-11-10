SELECT cron.alter_job(472, command := $c$
  SELECT net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/sync-vault-service-key',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || public.internal_job_key()),
    body := '{}'::jsonb
  );
$c$);
SELECT cron.alter_job(7, command := $c$
  SELECT net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/retry-stripe-webhooks',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || public.internal_job_key()),
    body := '{}'::jsonb
  );
$c$);