ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_payment_error text;

CREATE OR REPLACE FUNCTION public.admin_get_billing_issues(_include_resolved boolean DEFAULT false)
RETURNS TABLE (
  alert_id uuid,
  category text,
  severity text,
  message text,
  details jsonb,
  created_at timestamptz,
  resolved boolean,
  user_id uuid,
  email text,
  full_name text,
  plan text,
  account_status text,
  subscription_status text,
  cancel_at_period_end boolean,
  current_period_end timestamptz,
  payment_failed_at timestamptz,
  is_locked boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
      'billing_subscription_paused'
    )
    AND public.has_role(auth.uid(), 'admin')
    AND (_include_resolved OR a.resolved = false)
  ORDER BY a.created_at DESC
  LIMIT 300;
$$;

REVOKE ALL ON FUNCTION public.admin_get_billing_issues(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_billing_issues(boolean) TO authenticated;