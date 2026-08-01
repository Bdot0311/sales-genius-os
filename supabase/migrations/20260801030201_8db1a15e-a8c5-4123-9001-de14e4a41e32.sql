ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS failed_invoice_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_pause_reason text;

CREATE OR REPLACE FUNCTION public.billing_record_auto_pause(
  _user_id uuid,
  _reason text,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.subscriptions
  SET account_status = 'paused',
      status = 'past_due',
      auto_paused_at = now(),
      auto_pause_reason = left(coalesce(_reason, 'Unpaid invoices'), 500),
      updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (
    _user_id,
    'billing_auto_pause',
    'subscription',
    _user_id,
    jsonb_build_object('reason', _reason) || coalesce(_details, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.billing_record_auto_pause(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_record_auto_pause(uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_bump_failed_invoice_count(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.subscriptions
  SET failed_invoice_count = coalesce(failed_invoice_count, 0) + 1,
      updated_at = now()
  WHERE user_id = _user_id
  RETURNING failed_invoice_count INTO v_count;
  RETURN coalesce(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.billing_bump_failed_invoice_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_bump_failed_invoice_count(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.billing_reset_failed_invoice_count(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.subscriptions
  SET failed_invoice_count = 0,
      auto_paused_at = NULL,
      auto_pause_reason = NULL,
      updated_at = now()
  WHERE user_id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_reset_failed_invoice_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_reset_failed_invoice_count(uuid) TO service_role;

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
      'billing_cancellation',
      'billing_cancellation_scheduled',
      'billing_payment_failed',
      'billing_payment_action_required',
      'billing_dispute',
      'billing_subscription_paused',
      'billing_auto_paused'
    )
    AND public.has_role(auth.uid(), 'admin')
    AND (_include_resolved OR a.resolved = false)
  ORDER BY a.created_at DESC
  LIMIT 300;
$function$;