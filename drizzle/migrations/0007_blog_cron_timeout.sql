SELECT cron.alter_job(
  job_id := 14,
  command := $$
  SELECT net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/generate-blog-post',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.internal_job_key()
    ),
    body := jsonb_build_object('triggered_at', now()),
    timeout_milliseconds := 120000
  );
  $$
);

SELECT cron.alter_job(
  job_id := 15,
  command := $$
  SELECT net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/refill-blog-topics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.internal_job_key()
    ),
    body := jsonb_build_object('triggered_at', now()),
    timeout_milliseconds := 120000
  );
  $$
);
