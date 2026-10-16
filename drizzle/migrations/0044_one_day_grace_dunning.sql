CREATE OR REPLACE FUNCTION public.billing_start_grace_period(_user_id uuid, _days integer DEFAULT 1, _reason text DEFAULT NULL::text, _details jsonb DEFAULT '{}'::jsonb)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _started timestamptz;
  _existing timestamptz;
  _ends timestamptz;
BEGIN
  SELECT grace_started_at, grace_period_ends_at INTO _started, _existing
  FROM public.subscriptions WHERE user_id = _user_id;

  -- One grace window per run of failures: retries never reopen it.
  IF _started IS NOT NULL THEN
    RETURN _existing;
  END IF;

  _ends := now() + make_interval(days => GREATEST(COALESCE(_days, 1), 0));
  UPDATE public.subscriptions
  SET grace_started_at = now(), grace_period_ends_at = _ends, updated_at = now()
  WHERE user_id = _user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_values, metadata)
  VALUES (_user_id, 'billing_grace_started', 'subscription', _user_id,
    jsonb_build_object('grace_period_ends_at', _ends),
    jsonb_build_object('reason', COALESCE(_reason, 'Invoice payment failed'), 'source', 'policy') || COALESCE(_details, '{}'::jsonb));
  RETURN _ends;
END;
$function$;

CREATE OR REPLACE FUNCTION public.billing_expire_grace_periods()
 RETURNS TABLE(user_id uuid, paused boolean)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
BEGIN
  FOR _row IN
    SELECT s.user_id, s.grace_period_ends_at, p.email
    FROM public.subscriptions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.grace_period_ends_at IS NOT NULL
      AND s.grace_period_ends_at <= now()
      AND s.account_status NOT IN ('locked', 'cancelled')
      AND s.status IN ('past_due', 'unpaid', 'inactive')
  LOOP
    -- Temporary: previous_plan is kept so a successful payment restores it.
    PERFORM public.billing_downgrade_to_free(
      _row.user_id,
      'Grace day ended with the invoice unpaid — temporarily on the free plan',
      jsonb_build_object('trigger', 'grace_period_expired', 'target_email', _row.email));

    -- grace_started_at stays set so the run is not restarted by later retries.
    UPDATE public.subscriptions
    SET grace_period_ends_at = NULL, account_status = 'past_due', updated_at = now()
    WHERE public.subscriptions.user_id = _row.user_id;

    RETURN QUERY SELECT _row.user_id, false;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.billing_expire_grace_periods() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_expire_grace_periods() TO service_role;
REVOKE ALL ON FUNCTION public.billing_start_grace_period(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_start_grace_period(uuid, integer, text, jsonb) TO service_role;