
-- 1. Create a secure RPC function for deducting credits atomically
CREATE OR REPLACE FUNCTION public.deduct_search_credits(_amount integer, _description text DEFAULT 'Search query')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Validate amount
  IF _amount < 1 OR _amount > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  -- Get current credits with row lock
  SELECT search_credits_remaining, daily_searches_used, daily_email_limit, plan
  INTO _remaining, _daily_used, _daily_limit, _plan
  FROM subscriptions
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'No subscription found');
  END IF;

  -- Check sufficient credits
  IF _remaining < _amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient search credits');
  END IF;

  -- Calculate daily limit based on plan
  _daily_limit := CASE
    WHEN _plan = 'free' THEN 5
    WHEN _plan = 'starter' THEN 20
    WHEN _plan = 'growth' THEN 50
    WHEN _plan = 'pro' THEN 200
    ELSE 5
  END;

  -- Check daily limit
  IF _daily_used >= _daily_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Daily search limit reached');
  END IF;

  _new_remaining := _remaining - _amount;
  _new_daily_used := _daily_used + 1;

  -- Atomically update
  UPDATE subscriptions
  SET search_credits_remaining = _new_remaining,
      daily_searches_used = _new_daily_used,
      updated_at = now()
  WHERE user_id = _user_id;

  -- Log transaction
  INSERT INTO search_transactions (user_id, type, amount, balance_after, description)
  VALUES (_user_id, 'usage', -_amount, _new_remaining, _description);

  RETURN jsonb_build_object(
    'success', true,
    'remaining', _new_remaining,
    'daily_used', _new_daily_used
  );
END;
$$;

-- 2. Drop the overly permissive UPDATE policy
DROP POLICY IF EXISTS "Users can update own subscription" ON subscriptions;

-- 3. Create a restricted UPDATE policy that only allows daily counter resets (safe fields)
CREATE POLICY "Users can update own subscription safe fields"
ON subscriptions
FOR UPDATE
TO public
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND plan = (SELECT s.plan FROM subscriptions s WHERE s.user_id = auth.uid())
  AND leads_limit = (SELECT s.leads_limit FROM subscriptions s WHERE s.user_id = auth.uid())
  AND search_credits_base = (SELECT s.search_credits_base FROM subscriptions s WHERE s.user_id = auth.uid())
  AND status = (SELECT s.status FROM subscriptions s WHERE s.user_id = auth.uid())
  AND stripe_customer_id IS NOT DISTINCT FROM (SELECT s.stripe_customer_id FROM subscriptions s WHERE s.user_id = auth.uid())
  AND stripe_subscription_id IS NOT DISTINCT FROM (SELECT s.stripe_subscription_id FROM subscriptions s WHERE s.user_id = auth.uid())
  AND account_status IS NOT DISTINCT FROM (SELECT s.account_status FROM subscriptions s WHERE s.user_id = auth.uid())
);
