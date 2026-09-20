-- 1. Remember the paid plan we downgraded from so it can be restored on payment.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS previous_plan public.subscription_plan;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('subscriptions', 'previous_plan', 'Paid plan held before an automatic downgrade to free (unpaid invoice, cancellation, trial end). Restored on payment.')
ON CONFLICT DO NOTHING;

-- 2. Canonical downgrade / restore helpers.
CREATE OR REPLACE FUNCTION public.billing_downgrade_to_free(
  _user_id uuid,
  _reason text,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _plan public.subscription_plan;
  _prev jsonb;
BEGIN
  SELECT s.plan,
         jsonb_build_object(
           'plan', s.plan,
           'previous_plan', s.previous_plan,
           'search_credits_base', s.search_credits_base,
           'leads_limit', s.leads_limit
         )
    INTO _plan, _prev
  FROM public.subscriptions s
  WHERE s.user_id = _user_id;

  IF _plan IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.subscriptions
  SET previous_plan = CASE WHEN _plan <> 'free' THEN _plan ELSE previous_plan END,
      plan = 'free',
      search_credits_base = 100,
      search_credits_remaining = LEAST(COALESCE(search_credits_remaining, 0), 100),
      leads_limit = 100,
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, metadata)
  VALUES (
    _user_id, 'billing_downgrade_to_free', 'subscription', _user_id,
    _prev,
    jsonb_build_object('plan', 'free'),
    jsonb_build_object('reason', COALESCE(_reason, 'Automatic downgrade'), 'source', 'policy')
      || COALESCE(_details, '{}'::jsonb)
  );

  RETURN _plan <> 'free';
END;
$function$;

CREATE OR REPLACE FUNCTION public.billing_restore_previous_plan(
  _user_id uuid,
  _reason text DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _prev public.subscription_plan;
BEGIN
  SELECT previous_plan INTO _prev FROM public.subscriptions WHERE user_id = _user_id;
  IF _prev IS NULL OR _prev = 'free' THEN
    RETURN false;
  END IF;

  UPDATE public.subscriptions
  SET plan = _prev,
      previous_plan = NULL,
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, metadata)
  VALUES (
    _user_id, 'billing_restore_plan', 'subscription', _user_id,
    jsonb_build_object('plan', 'free'),
    jsonb_build_object('plan', _prev),
    jsonb_build_object('reason', COALESCE(_reason, 'Payment received'), 'source', 'policy')
      || COALESCE(_details, '{}'::jsonb)
  );

  RETURN true;
END;
$function$;

-- 3. The webhook applier silently dropped cancellation, trial and dunning
--    columns, so the admin panel had nothing to show. Apply every key present
--    in the payload, including explicit nulls.
CREATE OR REPLACE FUNCTION public.apply_stripe_event_to_subscription(
  _user_id uuid,
  _event_id text,
  _event_created_at timestamp with time zone,
  _updates jsonb
)
RETURNS TABLE(applied boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _last_id text;
  _last_at timestamptz;
BEGIN
  SELECT last_stripe_event_id, last_stripe_event_at
    INTO _last_id, _last_at
    FROM public.subscriptions
    WHERE user_id = _user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'no_subscription_row';
    RETURN;
  END IF;

  IF _last_id IS NOT NULL AND _last_id = _event_id THEN
    RETURN QUERY SELECT false, 'duplicate_event';
    RETURN;
  END IF;

  IF _last_at IS NOT NULL AND _event_created_at IS NOT NULL AND _event_created_at < _last_at THEN
    RETURN QUERY SELECT false, 'stale_event';
    RETURN;
  END IF;

  UPDATE public.subscriptions s
    SET
      plan = CASE WHEN _updates ? 'plan' AND _updates->>'plan' IS NOT NULL
                  THEN (_updates->>'plan')::subscription_plan ELSE s.plan END,
      previous_plan = CASE WHEN _updates ? 'previous_plan'
                  THEN (_updates->>'previous_plan')::subscription_plan ELSE s.previous_plan END,
      status = CASE WHEN _updates ? 'status' AND _updates->>'status' IS NOT NULL
                  THEN _updates->>'status' ELSE s.status END,
      account_status = CASE WHEN _updates ? 'account_status' AND _updates->>'account_status' IS NOT NULL
                  THEN _updates->>'account_status' ELSE s.account_status END,
      stripe_customer_id = CASE WHEN _updates ? 'stripe_customer_id'
                  THEN _updates->>'stripe_customer_id' ELSE s.stripe_customer_id END,
      stripe_subscription_id = CASE WHEN _updates ? 'stripe_subscription_id'
                  THEN _updates->>'stripe_subscription_id' ELSE s.stripe_subscription_id END,
      search_credits_base = CASE WHEN _updates ? 'search_credits_base' AND _updates->>'search_credits_base' IS NOT NULL
                  THEN (_updates->>'search_credits_base')::int ELSE s.search_credits_base END,
      search_credits_remaining = CASE WHEN _updates ? 'search_credits_remaining' AND _updates->>'search_credits_remaining' IS NOT NULL
                  THEN (_updates->>'search_credits_remaining')::int ELSE s.search_credits_remaining END,
      leads_limit = CASE WHEN _updates ? 'leads_limit' AND _updates->>'leads_limit' IS NOT NULL
                  THEN (_updates->>'leads_limit')::int ELSE s.leads_limit END,
      daily_searches_used = CASE WHEN _updates ? 'daily_searches_used' AND _updates->>'daily_searches_used' IS NOT NULL
                  THEN (_updates->>'daily_searches_used')::int ELSE s.daily_searches_used END,
      current_period_start = CASE WHEN _updates ? 'current_period_start'
                  THEN (_updates->>'current_period_start')::timestamptz ELSE s.current_period_start END,
      current_period_end = CASE WHEN _updates ? 'current_period_end'
                  THEN (_updates->>'current_period_end')::timestamptz ELSE s.current_period_end END,
      credits_reset_at = CASE WHEN _updates ? 'credits_reset_at'
                  THEN (_updates->>'credits_reset_at')::timestamptz ELSE s.credits_reset_at END,
      trial_end_date = CASE WHEN _updates ? 'trial_end_date'
                  THEN (_updates->>'trial_end_date')::timestamptz ELSE s.trial_end_date END,
      cancel_at_period_end = CASE WHEN _updates ? 'cancel_at_period_end'
                  THEN (_updates->>'cancel_at_period_end')::boolean ELSE s.cancel_at_period_end END,
      canceled_at = CASE WHEN _updates ? 'canceled_at'
                  THEN (_updates->>'canceled_at')::timestamptz ELSE s.canceled_at END,
      payment_failed_at = CASE WHEN _updates ? 'payment_failed_at'
                  THEN (_updates->>'payment_failed_at')::timestamptz ELSE s.payment_failed_at END,
      last_payment_error = CASE WHEN _updates ? 'last_payment_error'
                  THEN _updates->>'last_payment_error' ELSE s.last_payment_error END,
      last_stripe_event_id = _event_id,
      last_stripe_event_at = COALESCE(_event_created_at, now()),
      updated_at = now()
    WHERE s.user_id = _user_id;

  RETURN QUERY SELECT true, 'applied';
END;
$function$;

-- 4. An automatic pause now also drops entitlements back to free, and a
--    successful payment restores the plan that was held before.
CREATE OR REPLACE FUNCTION public.billing_record_auto_pause(
  _user_id uuid,
  _reason text,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.subscriptions
  SET account_status = 'paused',
      status = 'past_due',
      auto_paused_at = now(),
      auto_pause_reason = left(coalesce(_reason, 'Unpaid invoices'), 500),
      updated_at = now()
  WHERE user_id = _user_id;

  PERFORM public.billing_downgrade_to_free(
    _user_id,
    COALESCE(_reason, 'Unpaid invoices'),
    jsonb_build_object('trigger', 'auto_pause') || COALESCE(_details, '{}'::jsonb)
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    _user_id,
    'billing_auto_pause',
    'subscription',
    _user_id,
    jsonb_build_object('reason', _reason) || coalesce(_details, '{}'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.billing_record_auto_resume(
  _user_id uuid,
  _reason text DEFAULT NULL::text,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
           'failed_invoice_count', failed_invoice_count,
           'plan', plan,
           'previous_plan', previous_plan
         )
    INTO _status, _auto_paused, _prev
  FROM public.subscriptions WHERE user_id = _user_id;

  IF _status IS NULL THEN
    RETURN false;
  END IF;

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

  PERFORM public.billing_restore_previous_plan(
    _user_id,
    COALESCE(_reason, 'Payment succeeded'),
    jsonb_build_object('trigger', 'auto_resume') || COALESCE(_details, '{}'::jsonb)
  );

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
$function$;

-- 5. An expired trial now returns the account to the free tier (usable) instead
--    of locking it out, and the change is logged.
CREATE OR REPLACE FUNCTION public.lock_expired_trials()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
BEGIN
  FOR _row IN
    SELECT s.user_id, s.plan, s.trial_end_date, p.email
    FROM public.subscriptions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.account_status = 'trial'
      AND s.trial_end_date IS NOT NULL
      AND s.trial_end_date < now()
      AND s.status = 'active'
  LOOP
    UPDATE public.subscriptions
    SET account_status = 'active',
        status = 'active',
        updated_at = now()
    WHERE user_id = _row.user_id;

    PERFORM public.billing_downgrade_to_free(
      _row.user_id,
      'Trial ended without a paid subscription',
      jsonb_build_object(
        'trigger', 'trial_expired',
        'trial_end_date', _row.trial_end_date,
        'target_email', _row.email,
        'previous_plan', _row.plan
      )
    );

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
    VALUES (
      _row.user_id, 'billing_trial_expired', 'subscription', _row.user_id,
      jsonb_build_object(
        'reason', 'Trial ended without a paid subscription',
        'source', 'policy',
        'target_email', _row.email,
        'previous_plan', _row.plan
      )
    );
  END LOOP;
END;
$function$;

-- 6. Surface the new lifecycle records in the admin billing views.
CREATE OR REPLACE FUNCTION public.admin_get_billing_issues(_include_resolved boolean DEFAULT false)
RETURNS TABLE(alert_id uuid, category text, severity text, message text, details jsonb, created_at timestamp with time zone, resolved boolean, user_id uuid, email text, full_name text, plan text, account_status text, subscription_status text, cancel_at_period_end boolean, current_period_end timestamp with time zone, payment_failed_at timestamp with time zone, is_locked boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    a.id,
    a.category,
    a.severity,
    a.message,
    a.details,
    a.created_at,
    a.resolved,
    a.user_id,
    p.email,
    p.full_name,
    s.plan::text,
    s.account_status,
    s.status,
    s.cancel_at_period_end,
    s.current_period_end,
    s.payment_failed_at,
    COALESCE(s.account_status = 'locked', false)
  FROM public.system_alerts a
  LEFT JOIN public.profiles p ON p.id = a.user_id
  LEFT JOIN public.subscriptions s ON s.user_id = a.user_id
  WHERE a.category IN (
      'billing_subscription_started',
      'billing_cancellation',
      'billing_cancellation_scheduled',
      'billing_payment_failed',
      'billing_payment_action_required',
      'billing_dispute',
      'billing_subscription_paused',
      'billing_auto_paused',
      'billing_auto_resumed',
      'billing_reconciled',
      'billing_trial_ended'
    )
    AND public.has_role(auth.uid(), 'admin')
    AND (_include_resolved OR a.resolved = false)
  ORDER BY a.created_at DESC
  LIMIT 300;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_billing_audit(_source text DEFAULT NULL::text, _search text DEFAULT NULL::text, _limit integer DEFAULT 100, _offset integer DEFAULT 0)
RETURNS TABLE(id uuid, source text, event_at timestamp with time zone, action text, actor_id uuid, actor_email text, target_user_id uuid, target_email text, status text, details jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      'billing_grace_expired', 'billing_downgrade_to_free', 'billing_restore_plan',
      'billing_trial_expired', 'billing_reconciled', 'billing_subscription_started',
      'lock_account', 'unlock_account', 'update_subscription',
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
$function$;

REVOKE ALL ON FUNCTION public.billing_downgrade_to_free(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_restore_previous_plan(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_downgrade_to_free(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_restore_previous_plan(uuid, text, jsonb) TO service_role;