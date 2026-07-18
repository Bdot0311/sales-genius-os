-- Deliverability Suite — Phase 5: schedule the warmup orchestrator.
-- Runs hourly during business hours (UTC) so warmup volume spreads naturally
-- across the day rather than in one burst. The function itself stays idle unless
-- there are 2+ active pooled mailboxes, so this is safe to schedule now.
SELECT cron.schedule(
  'warmup-orchestrator-hourly',
  '17 13-23 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/warmup-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZqbmVwdnh2eHJuY21za3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTU2NjEsImV4cCI6MjA3NjU3MTY2MX0.5r_bFaQNwZZ-XTUloOdFWcAZl0JShMbXsc6y6lPWq4o'
    ),
    body := '{"scheduled": true}'::jsonb
  ) AS request_id;
  $$
);
