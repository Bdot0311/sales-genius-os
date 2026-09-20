-- Hourly safety net: keep local entitlements in step with Stripe even when a
-- webhook never arrives.
select cron.unschedule('reconcile-stripe-subscriptions-hourly')
where exists (select 1 from cron.job where jobname = 'reconcile-stripe-subscriptions-hourly');

select cron.schedule(
  'reconcile-stripe-subscriptions-hourly',
  '23 * * * *',
  $$
  select net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/reconcile-stripe-subscriptions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.internal_job_key()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
