-- Add 'agency' to subscription_plan enum
ALTER TYPE public.subscription_plan ADD VALUE IF NOT EXISTS 'agency';

-- Update deduct_search_credits with correct daily limits
CREATE OR REPLACE FUNCTION public.deduct_search_credits(_amount integer, _description text DEFAULT 'Search query'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _remaining integer;
  _daily_used integer;
  _daily_limit integer;
  _plan text;
  _new_remaining integer;
  _new_daily_used integer;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF _amount < 1 OR _amount > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT search_credits_remaining, daily_searches_used, daily_email_limit, plan
  INTO _remaining, _daily_used, _daily_limit, _plan
  FROM subscriptions
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No subscription found');
  END IF;

  IF _remaining < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient search credits');
  END IF;

  _daily_limit := CASE
    WHEN _plan = 'free' THEN 5
    WHEN _plan = 'starter' THEN 100
    WHEN _plan = 'growth' THEN 250
    WHEN _plan = 'pro' THEN 500
    WHEN _plan = 'agency' THEN 1500
    ELSE 5
  END;

  IF _daily_used >= _daily_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Daily search limit reached');
  END IF;

  _new_remaining := _remaining - _amount;
  _new_daily_used := _daily_used + 1;

  UPDATE subscriptions
  SET search_credits_remaining = _new_remaining,
      daily_searches_used = _new_daily_used,
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO search_transactions (user_id, type, amount, balance_after, description)
  VALUES (_user_id, 'usage', -_amount, _new_remaining, _description);

  RETURN jsonb_build_object(
    'success', true,
    'remaining', _new_remaining,
    'daily_used', _new_daily_used
  );
END;
$function$;