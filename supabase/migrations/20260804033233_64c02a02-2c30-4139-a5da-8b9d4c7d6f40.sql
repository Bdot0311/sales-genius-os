-- 1. Allow service-role (no auth.uid()) callers to spend account quota.
CREATE OR REPLACE FUNCTION public.increment_account_send(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.sending_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.sending_accounts
   WHERE id = p_account_id
     AND (auth.uid() IS NULL OR user_id = auth.uid())
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF v_row.status <> 'active' THEN
    RETURN false;
  END IF;

  IF v_row.sent_today_date < CURRENT_DATE THEN
    v_row.sent_today := 0;
    v_row.sent_today_date := CURRENT_DATE;
  END IF;

  IF v_row.sent_today >= v_row.daily_limit THEN
    RETURN false;
  END IF;

  UPDATE public.sending_accounts
     SET sent_today = v_row.sent_today + 1,
         sent_today_date = v_row.sent_today_date,
         last_sent_at = now()
   WHERE id = p_account_id;

  RETURN true;
END;
$$;

-- 2. Backfill last_sent_at / today's counter from real send history.
UPDATE public.sending_accounts sa
   SET last_sent_at = agg.last_sent,
       sent_today = COALESCE(agg.today_count, 0),
       sent_today_date = CURRENT_DATE
  FROM (
    SELECT sending_account_id,
           max(sent_at) AS last_sent,
           count(*) FILTER (WHERE sent_at >= date_trunc('day', now())) AS today_count
      FROM public.sent_emails
     WHERE sending_account_id IS NOT NULL
       AND sent_at IS NOT NULL
     GROUP BY sending_account_id
  ) agg
 WHERE sa.id = agg.sending_account_id;

-- 3. Warmup worker on an hourly schedule (was manual-only).
SELECT cron.unschedule('warmup-orchestrator-hourly')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'warmup-orchestrator-hourly');

SELECT cron.schedule(
  'warmup-orchestrator-hourly',
  '25 * * * *',
  $$SELECT public.deliverability_call_edge('warmup-orchestrator', '{"scheduled": true}'::jsonb);$$
);