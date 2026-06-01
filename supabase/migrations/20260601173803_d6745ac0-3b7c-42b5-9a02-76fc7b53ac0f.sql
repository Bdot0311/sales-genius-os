ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS monthly_emails_sent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_emails_reset_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_monthly_email_limit(_plan public.subscription_plan)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _plan = 'free' THEN 0
    WHEN _plan = 'starter' THEN 50000
    WHEN _plan = 'growth' THEN 250000
    WHEN _plan IN ('pro','elite') THEN 1000000
    WHEN _plan = 'agency' THEN -1
    ELSE 0
  END;
$$;