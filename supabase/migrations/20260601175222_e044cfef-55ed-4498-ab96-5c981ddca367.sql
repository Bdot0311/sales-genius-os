
-- Timezone-safe helpers: month boundary based on UTC, so reset triggers consistently on the 1st for every user regardless of local TZ.
CREATE OR REPLACE FUNCTION public.current_month_start_utc()
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT date_trunc('month', (now() AT TIME ZONE 'UTC'))::timestamp AT TIME ZONE 'UTC';
$$;

CREATE OR REPLACE FUNCTION public.next_month_start_utc()
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT (date_trunc('month', (now() AT TIME ZONE 'UTC')) + interval '1 month')::timestamp AT TIME ZONE 'UTC';
$$;

-- Return per-user monthly + daily usage and limits.
CREATE OR REPLACE FUNCTION public.get_monthly_email_usage()
RETURNS TABLE(
  plan subscription_plan,
  monthly_sent integer,
  monthly_limit integer,
  monthly_remaining integer,
  monthly_reset_at timestamptz,
  daily_sent integer,
  daily_limit integer,
  daily_remaining integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _plan subscription_plan;
  _monthly_limit integer;
  _daily_limit integer;
  _monthly_sent integer;
  _daily_sent integer;
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  SELECT s.plan, COALESCE(s.daily_email_limit, 10)
    INTO _plan, _daily_limit
  FROM subscriptions s
  WHERE s.user_id = _uid
  LIMIT 1;

  IF _plan IS NULL THEN _plan := 'free'::subscription_plan; END IF;

  _monthly_limit := public.get_monthly_email_limit(_plan);

  -- Source of truth: count actually-sent emails this UTC month
  SELECT COUNT(*)::int INTO _monthly_sent
  FROM sent_emails se
  WHERE se.user_id = _uid
    AND se.status IN ('sent','delivered','opened','clicked','replied','bounced')
    AND se.sent_at >= public.current_month_start_utc()
    AND se.sent_at <  public.next_month_start_utc();

  SELECT COUNT(*)::int INTO _daily_sent
  FROM sent_emails se
  WHERE se.user_id = _uid
    AND se.status IN ('sent','delivered','opened','clicked','replied','bounced')
    AND se.sent_at >= date_trunc('day', (now() AT TIME ZONE 'UTC'))::timestamp AT TIME ZONE 'UTC';

  RETURN QUERY SELECT
    _plan,
    _monthly_sent,
    _monthly_limit,
    CASE WHEN _monthly_limit < 0 THEN -1 ELSE GREATEST(_monthly_limit - _monthly_sent, 0) END,
    public.next_month_start_utc(),
    _daily_sent,
    _daily_limit,
    GREATEST(_daily_limit - _daily_sent, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_monthly_email_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_month_start_utc() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.next_month_start_utc() TO authenticated, anon;

-- Per-sequence monthly counts for the current user.
CREATE OR REPLACE FUNCTION public.get_sequence_monthly_usage()
RETURNS TABLE(sequence_id uuid, sequence_name text, sent_this_month integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT s.id, s.name, COALESCE(c.cnt, 0)::int
  FROM email_sequences s
  LEFT JOIN (
    SELECT se.sequence_id, COUNT(*) AS cnt
    FROM sent_emails se
    WHERE se.user_id = _uid
      AND se.sequence_id IS NOT NULL
      AND se.status IN ('sent','delivered','opened','clicked','replied','bounced')
      AND se.sent_at >= public.current_month_start_utc()
      AND se.sent_at <  public.next_month_start_utc()
    GROUP BY se.sequence_id
  ) c ON c.sequence_id = s.id
  WHERE s.user_id = _uid
  ORDER BY COALESCE(c.cnt,0) DESC, s.name ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_sequence_monthly_usage() TO authenticated;

-- 30-day daily send trend for the dashboard chart.
CREATE OR REPLACE FUNCTION public.get_email_send_trend(_days integer DEFAULT 30)
RETURNS TABLE(day date, sent integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _d integer := GREATEST(LEAST(COALESCE(_days,30), 90), 1);
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE AT TIME ZONE 'UTC')::date - (_d - 1),
      (CURRENT_DATE AT TIME ZONE 'UTC')::date,
      interval '1 day'
    )::date AS d
  )
  SELECT days.d,
    COALESCE(COUNT(se.id), 0)::int
  FROM days
  LEFT JOIN sent_emails se
    ON se.user_id = _uid
   AND (se.sent_at AT TIME ZONE 'UTC')::date = days.d
   AND se.status IN ('sent','delivered','opened','clicked','replied','bounced')
  GROUP BY days.d
  ORDER BY days.d;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_email_send_trend(integer) TO authenticated;
