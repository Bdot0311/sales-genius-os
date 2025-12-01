-- Enable required extensions for cron and HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create the scheduled job that runs every hour at minute 0
SELECT cron.schedule(
  'run-scheduled-imports-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/run-scheduled-imports',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZqbmVwdnh2eHJuY21za3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTU2NjEsImV4cCI6MjA3NjU3MTY2MX0.5r_bFaQNwZZ-XTUloOdFWcAZl0JShMbXsc6y6lPWq4o"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);