DO $fix$ DECLARE def text; BEGIN
 def:=pg_get_functiondef('public.appsumo_apply_event(jsonb)'::regprocedure);
 def:=replace(def,'state:=CASE WHEN ev=''purchase'' THEN ''inactive'' WHEN ev=''deactivate'' THEN ''deactivated'' ELSE ''active'' END;', 'state:=CASE WHEN ev IN (''purchase'',''deactivate'') OR EXISTS(SELECT 1 FROM public.appsumo_licenses WHERE prev_license_key=k AND license_key<>k) THEN ''inactive'' WHEN ev=''migrate'' AND coalesce(payload->>''license_status'',payload->>''status'') IN (''inactive'',''deactivated'') THEN ''inactive'' ELSE ''active'' END;');
 def:=replace(def,'SET license_status=''deactivated'',updated_at=now() WHERE license_key=prev','SET license_status=''inactive'',updated_at=now() WHERE license_key=prev');
 EXECUTE def;
 def:=pg_get_functiondef('public.appsumo_sync_subscription(uuid)'::regprocedure);
 def:=replace(def,'current_period_end=now()+interval ''100 years''','current_period_end=CASE WHEN sub.appsumo_license_key IS NOT NULL THEN sub.current_period_end ELSE now()+interval ''1 month'' END');
 EXECUTE def;
END; $fix$;
CREATE OR REPLACE FUNCTION public.appsumo_refresh_credits() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; n integer:=0; next_reset timestamptz;
BEGIN
 FOR s IN SELECT sub.id,sub.user_id,sub.plan,sub.credits_reset_at,cfg.credits FROM public.subscriptions sub JOIN public.appsumo_licenses l ON l.license_key=sub.appsumo_license_key JOIN public.appsumo_plan_config cfg ON cfg.tier=l.tier WHERE l.license_status='active' AND NOT l.is_test AND cfg.renewal='monthly' AND sub.credits_reset_at<=now() FOR UPDATE OF sub SKIP LOCKED LOOP
  next_reset:=s.credits_reset_at;
  WHILE next_reset<=now() LOOP next_reset:=next_reset+interval '1 month'; END LOOP;
  UPDATE public.subscriptions SET search_credits_remaining=CASE WHEN s.plan='starter' THEN s.credits ELSE search_credits_remaining+s.credits END,credits_reset_at=next_reset,current_period_start=next_reset-interval '1 month',current_period_end=next_reset,updated_at=now() WHERE id=s.id;
  n:=n+1;
 END LOOP;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.appsumo_refresh_credits() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.appsumo_refresh_credits() TO service_role;
COMMENT ON COLUMN public.subscriptions.appsumo_license_key IS 'Server-managed AppSumo subscription licensing source; not lifetime or unlimited billing exemption';