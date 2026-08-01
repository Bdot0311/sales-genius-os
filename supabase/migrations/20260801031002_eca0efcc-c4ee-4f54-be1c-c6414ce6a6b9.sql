-- Grace period tracking
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_resumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_resume_reason text;

CREATE INDEX IF NOT EXISTS idx_subscriptions_grace_ends
  ON public.subscriptions (grace_period_ends_at)
  WHERE grace_period_ends_at IS NOT NULL;

-- Start (or keep) a grace period after a failed payment. Access stays on.
CREATE OR REPLACE FUNCTION public.billing_start_grace_period(
  _user_id uuid,
  _days integer DEFAULT 7,
  _reason text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _days_safe integer := GREATEST(COALESCE(_days, 7), 0);
  _existing timestamptz;
  _ends timestamptz;
BEGIN
  SELECT grace_period_ends_at INTO _existing
  FROM public.subscriptions WHERE user_id = _user_id;

  -- Keep the original deadline so repeated failures cannot extend the window.
  IF _existing IS NOT NULL AND _existing > now() THEN
    RETURN _existing;
  END IF;

  _ends := now() + make_interval(days => _days_safe);

  UPDATE public.subscriptions
  SET grace_started_at = now(),
      grace_period_ends_at = _ends,
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_values, metadata)
  VALUES (
    _user_id,
    'billing_grace_started',
    'subscription',
    _user_id,
    jsonb_build_object('grace_period_ends_at', _ends, 'grace_days', _days_safe),
    jsonb_build_object('reason', COALESCE(_reason, 'Invoice payment failed'), 'source', 'policy')
      || COALESCE(_details, '{}'::jsonb)
  );

  RETURN _ends;
END;
$$;

-- Automatically restore access after a successful payment / retry.
-- Only reverses automatic restrictions; admin pauses ('locked') are left alone.
CREATE OR REPLACE FUNCTION public.billing_record_auto_resume(
  _user_id uuid,
  _reason text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev jsonb;
  _status text;
  _auto_paused timestamptz;
BEGIN
  SELECT account_status, auto_paused_at,
         jsonb_build_object(
           'account_status', account_status,
           'status', status,
           'auto_paused_at', auto_paused_at,
           'auto_pause_reason', auto_pause_reason,
           'grace_period_ends_at', grace_period_ends_at,
           'failed_invoice_count', failed_invoice_count
         )
    INTO _status, _auto_paused, _prev
  FROM public.subscriptions WHERE user_id = _user_id;

  IF _status IS NULL THEN
    RETURN false;
  END IF;

  -- Never silently undo a manual admin lock or a real cancellation.
  IF _status = 'locked' OR _status = 'cancelled' THEN
    RETURN false;
  END IF;

  UPDATE public.subscriptions
  SET account_status = 'active',
      status = 'active',
      auto_paused_at = NULL,
      auto_pause_reason = NULL,
      grace_started_at = NULL,
      grace_period_ends_at = NULL,
      failed_invoice_count = 0,
      payment_failed_at = NULL,
      last_payment_error = NULL,
      auto_resumed_at = now(),
      auto_resume_reason = left(COALESCE(_reason, 'Payment succeeded'), 500),
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, metadata)
  VALUES (
    _user_id,
    'billing_auto_resume',
    'subscription',
    _user_id,
    _prev,
    jsonb_build_object('account_status', 'active', 'status', 'active'),
    jsonb_build_object(
      'reason', COALESCE(_reason, 'Payment succeeded'),
      'was_auto_paused', _auto_paused IS NOT NULL,
      'previous_account_status', _status,
      'source', 'policy'
    ) || COALESCE(_details, '{}'::jsonb)
  );

  RETURN true;
END;
$$;

-- Pause accounts whose grace period expired while payment is still failing.
CREATE OR REPLACE FUNCTION public.billing_expire_grace_periods()
RETURNS TABLE (user_id uuid, paused boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _grace_enabled boolean;
BEGIN
  SELECT COALESCE((setting_value->'grace'->>'enabled')::boolean, true)
    INTO _grace_enabled
  FROM public.admin_settings
  WHERE setting_key = 'billing_notifications';

  IF _grace_enabled IS FALSE THEN
    RETURN;
  END IF;

  FOR _row IN
    SELECT s.user_id, s.grace_period_ends_at, s.failed_invoice_count, s.last_payment_error, p.email
    FROM public.subscriptions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.grace_period_ends_at IS NOT NULL
      AND s.grace_period_ends_at <= now()
      AND s.account_status NOT IN ('locked', 'paused', 'cancelled')
      AND s.status IN ('past_due', 'unpaid', 'inactive')
  LOOP
    PERFORM public.billing_record_auto_pause(
      _row.user_id,
      'Grace period expired with the invoice still unpaid',
      jsonb_build_object(
        'trigger', 'grace_period_expired',
        'grace_period_ends_at', _row.grace_period_ends_at,
        'failed_invoice_count', _row.failed_invoice_count,
        'decline_reason', _row.last_payment_error,
        'email', _row.email
      )
    );

    UPDATE public.subscriptions
    SET grace_period_ends_at = NULL, updated_at = now()
    WHERE public.subscriptions.user_id = _row.user_id;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      _row.user_id, 'billing_grace_expired', 'subscription', _row.user_id,
      jsonb_build_object('source', 'policy', 'reason', 'Grace period expired with the invoice still unpaid',
                         'target_email', _row.email)
    );

    RETURN QUERY SELECT _row.user_id, true;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_start_grace_period(uuid, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_record_auto_resume(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_expire_grace_periods() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_start_grace_period(uuid, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_record_auto_resume(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_expire_grace_periods() TO service_role;

-- Hourly enforcement of expired grace periods
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('billing-expire-grace-periods')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'billing-expire-grace-periods');

    PERFORM cron.schedule(
      'billing-expire-grace-periods',
      '7 * * * *',
      $cron$SELECT public.billing_expire_grace_periods();$cron$
    );
  END IF;
END
$$;

-- Include the new policy actions in the billing audit trail
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
      'billing_auto_pause', 'billing_auto_resume', 'billing_grace_started',
      'billing_grace_expired', 'lock_account', 'unlock_account', 'update_subscription',
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