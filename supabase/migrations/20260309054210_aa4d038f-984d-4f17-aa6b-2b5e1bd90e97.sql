
CREATE OR REPLACE FUNCTION public.admin_update_subscription(_user_id uuid, _plan subscription_plan, _status text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _leads_limit INTEGER;
  _credits INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  _leads_limit := CASE 
    WHEN _plan = 'free' THEN 0
    WHEN _plan = 'starter' THEN 400
    WHEN _plan = 'growth' THEN 1200
    WHEN _plan = 'pro' THEN 3000
    ELSE 999999
  END;

  _credits := CASE
    WHEN _plan = 'free' THEN 0
    WHEN _plan = 'starter' THEN 400
    WHEN _plan = 'growth' THEN 1200
    WHEN _plan = 'pro' THEN 3000
    ELSE 999999
  END;

  UPDATE subscriptions
  SET 
    plan = _plan,
    leads_limit = _leads_limit,
    search_credits_base = _credits,
    search_credits_remaining = _credits,
    status = COALESCE(_status, status),
    updated_at = now()
  WHERE user_id = _user_id;

  -- Log the action
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    auth.uid(),
    'update_subscription',
    'user',
    _user_id,
    jsonb_build_object('new_plan', _plan::text, 'leads_limit', _leads_limit, 'credits', _credits)
  );
END;
$$;
