-- 1) Admin actions now log actor + target details consistently

CREATE OR REPLACE FUNCTION public.admin_lock_user(_user_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_email text;
  _prev jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  SELECT email INTO _target_email FROM public.profiles WHERE id = _user_id;
  SELECT jsonb_build_object('account_status', account_status, 'status', status, 'plan', plan::text)
    INTO _prev FROM public.subscriptions WHERE user_id = _user_id;

  UPDATE public.subscriptions
  SET account_status = 'locked',
      status = 'inactive',
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, metadata)
  VALUES (
    auth.uid(),
    'billing_pause_account',
    'subscription',
    _user_id,
    _prev,
    jsonb_build_object('account_status', 'locked', 'status', 'inactive'),
    jsonb_build_object(
      'reason', _reason,
      'actor_id', auth.uid(),
      'target_user_id', _user_id,
      'target_email', _target_email,
      'source', 'admin_action'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unlock_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_email text;
  _prev jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  SELECT email INTO _target_email FROM public.profiles WHERE id = _user_id;
  SELECT jsonb_build_object('account_status', account_status, 'status', status, 'plan', plan::text)
    INTO _prev FROM public.subscriptions WHERE user_id = _user_id;

  UPDATE public.subscriptions
  SET account_status = 'active',
      status = 'active',
      auto_paused_at = NULL,
      auto_pause_reason = NULL,
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, metadata)
  VALUES (
    auth.uid(),
    'billing_restore_account',
    'subscription',
    _user_id,
    _prev,
    jsonb_build_object('account_status', 'active', 'status', 'active'),
    jsonb_build_object(
      'actor_id', auth.uid(),
      'target_user_id', _user_id,
      'target_email', _target_email,
      'source', 'admin_action'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_email text;
  _prev jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  SELECT email INTO _target_email FROM public.profiles WHERE id = _user_id;
  SELECT jsonb_build_object('account_status', account_status, 'status', status, 'plan', plan::text,
                            'stripe_customer_id', stripe_customer_id)
    INTO _prev FROM public.subscriptions WHERE user_id = _user_id;

  -- Log before deletion so the trail survives the cascade
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, metadata)
  VALUES (
    auth.uid(),
    'billing_remove_account',
    'user',
    _user_id,
    _prev,
    jsonb_build_object(
      'actor_id', auth.uid(),
      'target_user_id', _user_id,
      'target_email', _target_email,
      'source', 'admin_action'
    )
  );

  DELETE FROM auth.users WHERE id = _user_id;
END;
$$;

-- 2) Unified billing audit trail report (admin only)

CREATE OR REPLACE FUNCTION public.admin_get_billing_audit(
  _source text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 100,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  source text,
  event_at timestamptz,
  action text,
  actor_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  status text,
  details jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  WITH admin_actions AS (
    SELECT
      a.id,
      'admin_action'::text AS source,
      a.created_at AS event_at,
      a.action,
      COALESCE((a.metadata->>'actor_id')::uuid, a.user_id) AS actor_id,
      ap.email AS actor_email,
      COALESCE((a.metadata->>'target_user_id')::uuid, a.entity_id) AS target_user_id,
      COALESCE(a.metadata->>'target_email', tp.email) AS target_email,
      'recorded'::text AS status,
      jsonb_strip_nulls(
        jsonb_build_object(
          'reason', a.metadata->>'reason',
          'old_values', a.old_values,
          'new_values', a.new_values,
          'metadata', a.metadata,
          'ip_address', a.ip_address
        )
      ) AS details
    FROM public.audit_logs a
    LEFT JOIN public.profiles ap ON ap.id = COALESCE((a.metadata->>'actor_id')::uuid, a.user_id)
    LEFT JOIN public.profiles tp ON tp.id = COALESCE((a.metadata->>'target_user_id')::uuid, a.entity_id)
    WHERE a.action IN (
      'billing_pause_account', 'billing_restore_account', 'billing_remove_account',
      'billing_auto_pause', 'lock_account', 'unlock_account', 'update_subscription',
      'set_trial', 'set_admin'
    )
  ),
  webhooks AS (
    SELECT
      w.id,
      'stripe_webhook'::text AS source,
      w.created_at AS event_at,
      w.event_type AS action,
      NULL::uuid AS actor_id,
      'stripe'::text AS actor_email,
      s.user_id AS target_user_id,
      sp.email AS target_email,
      w.status,
      jsonb_strip_nulls(
        jsonb_build_object(
          'event_id', w.event_id,
          'attempts', w.attempts,
          'last_error', w.last_error,
          'processed_at', w.processed_at,
          'stripe_customer_id', w.payload->'data'->'object'->>'customer',
          'amount_due', w.payload->'data'->'object'->>'amount_due',
          'invoice_url', w.payload->'data'->'object'->>'hosted_invoice_url'
        )
      ) AS details
    FROM public.stripe_webhook_events w
    LEFT JOIN public.subscriptions s
      ON s.stripe_customer_id = (w.payload->'data'->'object'->>'customer')
    LEFT JOIN public.profiles sp ON sp.id = s.user_id
  ),
  merged AS (
    SELECT * FROM admin_actions
    UNION ALL
    SELECT * FROM webhooks
  )
  SELECT m.*
  FROM merged m
  WHERE (_source IS NULL OR _source = 'all' OR m.source = _source)
    AND (
      _search IS NULL OR _search = ''
      OR m.action ILIKE '%' || _search || '%'
      OR COALESCE(m.target_email, '') ILIKE '%' || _search || '%'
      OR COALESCE(m.actor_email, '') ILIKE '%' || _search || '%'
      OR COALESCE(m.details->>'event_id', '') ILIKE '%' || _search || '%'
    )
  ORDER BY m.event_at DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)
  OFFSET GREATEST(COALESCE(_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_billing_audit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_billing_audit(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_billing_audit(text, text, integer, integer) TO service_role;