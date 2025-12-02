-- Add trial and account status fields to subscriptions
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS trial_end_date timestamp with time zone,
ADD COLUMN IF NOT EXISTS account_status text DEFAULT 'active';

-- Add constraint if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_account_status_check'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_account_status_check 
    CHECK (account_status IN ('active', 'locked', 'trial'));
  END IF;
END $$;

-- Update existing records to have account_status
UPDATE subscriptions SET account_status = 'active' WHERE account_status IS NULL;

-- Function to delete a user and all their data
CREATE OR REPLACE FUNCTION admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Delete all user data (cascading will handle related records)
  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

-- Function to lock a user account
CREATE OR REPLACE FUNCTION admin_lock_user(_user_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Update subscription status
  UPDATE subscriptions
  SET 
    account_status = 'locked',
    status = 'inactive',
    updated_at = now()
  WHERE user_id = _user_id;

  -- Log the action
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'lock_account',
    'user',
    _user_id,
    jsonb_build_object('reason', _reason, 'locked_by', auth.uid())
  );
END;
$$;

-- Function to unlock a user account
CREATE OR REPLACE FUNCTION admin_unlock_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Update subscription status
  UPDATE subscriptions
  SET 
    account_status = 'active',
    status = 'active',
    updated_at = now()
  WHERE user_id = _user_id;

  -- Log the action
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
  VALUES (auth.uid(), 'unlock_account', 'user', _user_id);
END;
$$;

-- Function to set trial period for a user
CREATE OR REPLACE FUNCTION admin_set_trial(_user_id uuid, _trial_days integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  -- Update subscription with trial
  UPDATE subscriptions
  SET 
    account_status = 'trial',
    trial_end_date = now() + (_trial_days || ' days')::interval,
    updated_at = now()
  WHERE user_id = _user_id;

  -- Log the action
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'set_trial',
    'user',
    _user_id,
    jsonb_build_object('trial_days', _trial_days, 'trial_end_date', now() + (_trial_days || ' days')::interval)
  );
END;
$$;

-- Function to check and lock expired trials
CREATE OR REPLACE FUNCTION lock_expired_trials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE subscriptions
  SET 
    account_status = 'locked',
    status = 'inactive',
    updated_at = now()
  WHERE account_status = 'trial'
  AND trial_end_date < now()
  AND status = 'active';
END;
$$;

-- Drop and recreate admin_get_all_subscriptions with new return type
DROP FUNCTION IF EXISTS admin_get_all_subscriptions();

CREATE OR REPLACE FUNCTION admin_get_all_subscriptions()
RETURNS TABLE(
  user_id uuid,
  email text,
  full_name text,
  plan subscription_plan,
  status text,
  account_status text,
  leads_limit integer,
  stripe_customer_id text,
  current_period_end timestamp with time zone,
  trial_end_date timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT 
    s.user_id,
    p.email,
    p.full_name,
    s.plan,
    s.status,
    s.account_status,
    s.leads_limit,
    s.stripe_customer_id,
    s.current_period_end,
    s.trial_end_date
  FROM subscriptions s
  JOIN profiles p ON p.id = s.user_id
  ORDER BY s.created_at DESC;
END;
$$;