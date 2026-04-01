CREATE OR REPLACE FUNCTION public.increment_daily_emails_sent(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE subscriptions
  SET daily_emails_sent = daily_emails_sent + 1
  WHERE user_id = _user_id
  AND status = 'active';
END;
$$;