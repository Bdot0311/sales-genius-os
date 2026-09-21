CREATE OR REPLACE FUNCTION public.admin_get_billing_summary()
RETURNS TABLE(
  new_subscriptions bigint,
  payment_issues bigint,
  cancelled bigint,
  cancelling_soon bigint,
  chargebacks bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    (
      SELECT count(DISTINCT w.event_id)
      FROM public.stripe_webhook_events w
      WHERE w.event_type = 'checkout.session.completed'
        AND w.status IN ('succeeded', 'processed')
        AND w.payload->'data'->'object'->>'mode' = 'subscription'
    )::bigint AS new_subscriptions,
    (
      SELECT count(DISTINCT s.user_id)
      FROM public.subscriptions s
      WHERE s.account_status IN ('past_due', 'grace_period', 'paused')
         OR s.status IN ('past_due', 'unpaid', 'incomplete', 'incomplete_expired')
         OR (s.payment_failed_at IS NOT NULL AND s.plan <> 'free')
    )::bigint AS payment_issues,
    (
      SELECT count(DISTINCT s.user_id)
      FROM public.subscriptions s
      WHERE s.account_status = 'cancelled'
         OR s.status IN ('cancelled', 'canceled')
    )::bigint AS cancelled,
    (
      SELECT count(DISTINCT s.user_id)
      FROM public.subscriptions s
      WHERE s.cancel_at_period_end = true
        AND s.account_status NOT IN ('cancelled')
        AND s.status NOT IN ('cancelled', 'canceled')
    )::bigint AS cancelling_soon,
    (
      SELECT count(DISTINCT w.event_id)
      FROM public.stripe_webhook_events w
      WHERE w.event_type IN ('charge.dispute.created', 'charge.dispute.updated')
        AND w.status IN ('succeeded', 'processed')
    )::bigint AS chargebacks;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_billing_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_billing_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_billing_summary() TO service_role;