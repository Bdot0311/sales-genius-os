-- Deliverability Suite — Phase 3: reputation engine RPC + nightly cron jobs.

-- Per-account aggregates over the outbound log, used by compute-reputation.
-- SECURITY DEFINER so the scheduled job can read across users; complaint signal
-- currently comes from sent_emails.status and improves once the bounce/complaint
-- classifier attributes events per account.
CREATE OR REPLACE FUNCTION public.get_reputation_inputs(p_days integer DEFAULT 30)
RETURNS TABLE (
  sending_account_id uuid,
  user_id uuid,
  sent bigint,
  bounced bigint,
  complaints bigint,
  opened bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    se.sending_account_id,
    se.user_id,
    count(*) AS sent,
    count(*) FILTER (WHERE se.status = 'bounced') AS bounced,
    count(*) FILTER (WHERE se.status = 'spam_complaint') AS complaints,
    count(*) FILTER (WHERE se.opened_at IS NOT NULL) AS opened
  FROM public.sent_emails se
  WHERE se.sending_account_id IS NOT NULL
    AND se.sent_at >= now() - make_interval(days => p_days)
  GROUP BY se.sending_account_id, se.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_reputation_inputs(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_reputation_inputs(integer) TO service_role;

-- Nightly reputation recompute (06:00 UTC).
SELECT cron.schedule(
  'compute-reputation-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/compute-reputation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZqbmVwdnh2eHJuY21za3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTU2NjEsImV4cCI6MjA3NjU3MTY2MX0.5r_bFaQNwZZ-XTUloOdFWcAZl0JShMbXsc6y6lPWq4o'
    ),
    body := '{"scheduled": true}'::jsonb
  ) AS request_id;
  $$
);

-- Nightly alert scan (06:15 UTC, after reputation is fresh).
SELECT cron.schedule(
  'deliverability-alerts-scan-daily',
  '15 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/deliverability-alerts-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZqbmVwdnh2eHJuY21za3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTU2NjEsImV4cCI6MjA3NjU3MTY2MX0.5r_bFaQNwZZ-XTUloOdFWcAZl0JShMbXsc6y6lPWq4o'
    ),
    body := '{"scheduled": true}'::jsonb
  ) AS request_id;
  $$
);
