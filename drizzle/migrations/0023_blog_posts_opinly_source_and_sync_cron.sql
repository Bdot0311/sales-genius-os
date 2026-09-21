-- Opinly-published articles land in the same table the blog already renders.
-- The source check constraint predates that source, so it has to name it or
-- every ingest fails with a constraint violation.
alter table public.blog_posts drop constraint if exists blog_posts_source_check;
alter table public.blog_posts
  add constraint blog_posts_source_check
  check (source = any (array['static'::text, 'ai'::text, 'manual'::text, 'opinly'::text]));

-- Hourly safety net behind the webhook: if a webhook delivery is ever missed,
-- the blog is at most an hour behind Opinly instead of permanently stale.
select cron.unschedule('sync-opinly-posts-hourly')
where exists (select 1 from cron.job where jobname = 'sync-opinly-posts-hourly');

select cron.schedule(
  'sync-opinly-posts-hourly',
  '20 * * * *',
  $$
  select net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/sync-opinly-posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.internal_job_key()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);