-- Fix SQL Injection vulnerability by using make_interval() instead of string concatenation
-- and adding input validation

-- Update get_expiring_trials function
CREATE OR REPLACE FUNCTION public.get_expiring_trials(_days_until_expiry integer)
RETURNS TABLE(user_id uuid, email text, full_name text, trial_end_date timestamp with time zone, days_remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Input validation: days must be between 1 and 365
  IF _days_until_expiry < 1 OR _days_until_expiry > 365 THEN
    RAISE EXCEPTION 'days_until_expiry must be between 1 and 365';
  END IF;

  RETURN QUERY
  SELECT 
    s.user_id,
    p.email,
    p.full_name,
    s.trial_end_date,
    CEIL(EXTRACT(EPOCH FROM (s.trial_end_date - now())) / 86400)::integer as days_remaining
  FROM subscriptions s
  JOIN profiles p ON p.id = s.user_id
  WHERE s.account_status = 'trial'
  AND s.trial_end_date IS NOT NULL
  AND s.trial_end_date > now()
  AND s.trial_end_date <= now() + make_interval(days => _days_until_expiry)
  AND s.trial_end_date >= now() + make_interval(days => _days_until_expiry - 1);
END;
$$;

-- Update admin_set_trial function
CREATE OR REPLACE FUNCTION public.admin_set_trial(_user_id uuid, _trial_days integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Input validation: trial days must be between 1 and 365
  IF _trial_days < 1 OR _trial_days > 365 THEN
    RAISE EXCEPTION 'trial_days must be between 1 and 365';
  END IF;

  -- Update subscription with trial using make_interval
  UPDATE subscriptions
  SET 
    account_status = 'trial',
    trial_end_date = now() + make_interval(days => _trial_days),
    updated_at = now()
  WHERE user_id = _user_id;

  -- Log the action
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'set_trial',
    'user',
    _user_id,
    jsonb_build_object('trial_days', _trial_days, 'trial_end_date', now() + make_interval(days => _trial_days))
  );
END;
$$;