CREATE TABLE public.appsumo_licenses (
 license_key text PRIMARY KEY, user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 license_status text NOT NULL DEFAULT 'inactive', tier integer NOT NULL DEFAULT 1 CHECK(tier BETWEEN 1 AND 5),
 is_test boolean NOT NULL DEFAULT false, prev_license_key text, parent_license_key text,
 partner_plan_name text, unit_quantity integer, event_timestamp bigint NOT NULL DEFAULT 0,
 raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb, credits_granted boolean NOT NULL DEFAULT false,
 revoked_balance integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.appsumo_licenses TO authenticated;
GRANT ALL ON public.appsumo_licenses TO service_role;
ALTER TABLE public.appsumo_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY appsumo_license_read ON public.appsumo_licenses FOR SELECT TO authenticated USING (user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY appsumo_license_server ON public.appsumo_licenses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX appsumo_license_owner ON public.appsumo_licenses(user_id);
CREATE TABLE public.appsumo_license_events (
 license_key text NOT NULL, event text NOT NULL, event_timestamp bigint NOT NULL, is_test boolean NOT NULL,
 payload jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(license_key,event,event_timestamp)
);
GRANT SELECT ON public.appsumo_license_events TO authenticated;
GRANT ALL ON public.appsumo_license_events TO service_role;
ALTER TABLE public.appsumo_license_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY appsumo_event_admin ON public.appsumo_license_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY appsumo_event_server ON public.appsumo_license_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE public.appsumo_redemption_claims (
 token_hash text PRIMARY KEY, license_key text NOT NULL REFERENCES public.appsumo_licenses(license_key),
 expires_at timestamptz NOT NULL, consumed_by uuid, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.appsumo_redemption_claims TO authenticated;
GRANT ALL ON public.appsumo_redemption_claims TO service_role;
ALTER TABLE public.appsumo_redemption_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY appsumo_claim_private ON public.appsumo_redemption_claims FOR SELECT TO authenticated USING (false);
CREATE POLICY appsumo_claim_server ON public.appsumo_redemption_claims FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TABLE public.appsumo_plan_config (
 tier integer PRIMARY KEY CHECK(tier BETWEEN 1 AND 5), plan public.subscription_plan NOT NULL,
 credits integer NOT NULL CHECK(credits>=0), daily_email_limit integer NOT NULL CHECK(daily_email_limit>=0),
 renewal text NOT NULL CHECK(renewal IN ('once','monthly')), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.appsumo_plan_config TO authenticated;
GRANT ALL ON public.appsumo_plan_config TO service_role;
ALTER TABLE public.appsumo_plan_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY appsumo_config_read ON public.appsumo_plan_config FOR SELECT TO authenticated USING (true);
CREATE POLICY appsumo_config_server ON public.appsumo_plan_config FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.subscriptions ADD COLUMN appsumo_license_key text;
CREATE OR REPLACE FUNCTION public.appsumo_sync_subscription(owner_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lic public.appsumo_licenses; cfg public.appsumo_plan_config; sub public.subscriptions; balance integer;
BEGIN
 SELECT * INTO sub FROM public.subscriptions WHERE user_id=owner_id FOR UPDATE;
 IF sub.id IS NULL THEN RAISE EXCEPTION 'Account subscription is unavailable'; END IF;
 IF public.has_role(owner_id,'admin') THEN RETURN; END IF;
 SELECT * INTO lic FROM public.appsumo_licenses WHERE user_id=owner_id AND license_status='active' AND NOT is_test AND parent_license_key IS NULL ORDER BY event_timestamp DESC LIMIT 1;
 IF lic.license_key IS NULL THEN
  IF sub.appsumo_license_key IS NOT NULL THEN
   UPDATE public.appsumo_licenses SET revoked_balance=sub.search_credits_remaining WHERE license_key=sub.appsumo_license_key;
   UPDATE public.subscriptions SET plan='free',status='active',account_status='active',appsumo_license_key=NULL,leads_limit=100,search_credits_base=0,search_credits_remaining=0,daily_email_limit=10,credits_reset_at=NULL,updated_at=now() WHERE id=sub.id;
  END IF;
  RETURN;
 END IF;
 SELECT * INTO cfg FROM public.appsumo_plan_config WHERE tier=lic.tier;
 IF cfg.tier IS NULL THEN RAISE EXCEPTION 'AppSumo tier allowance is not configured'; END IF;
 IF sub.stripe_subscription_id IS NOT NULL THEN RAISE EXCEPTION 'An existing billed subscription must be resolved before redemption'; END IF;
 balance:=CASE WHEN NOT lic.credits_granted THEN cfg.credits WHEN sub.appsumo_license_key IS NULL THEN lic.revoked_balance ELSE greatest(0,sub.search_credits_remaining+cfg.credits-sub.search_credits_base) END;
 UPDATE public.subscriptions SET plan=cfg.plan,status='active',account_status='active',appsumo_license_key=lic.license_key,leads_limit=cfg.credits,search_credits_base=cfg.credits,search_credits_remaining=balance,daily_email_limit=cfg.daily_email_limit,trial_end_date=NULL,previous_plan=NULL,credits_reset_at=CASE WHEN cfg.renewal='monthly' THEN coalesce(CASE WHEN sub.appsumo_license_key IS NOT NULL THEN sub.credits_reset_at END,now()+interval '1 month') ELSE NULL END,current_period_end=now()+interval '100 years',updated_at=now() WHERE id=sub.id;
 UPDATE public.appsumo_licenses SET credits_granted=true WHERE license_key=lic.license_key;
END; $$;
REVOKE ALL ON FUNCTION public.appsumo_sync_subscription(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.appsumo_sync_subscription(uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.appsumo_apply_event(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE k text:=payload->>'license_key'; ev text:=payload->>'event'; ts bigint:=(payload->>'event_timestamp')::bigint;
 prev text:=nullif(payload->>'prev_license_key',''); old public.appsumo_licenses; prior public.appsumo_licenses; owner_id uuid; state text; test_mode boolean:=coalesce((payload->>'test')::boolean,false);
BEGIN
 IF k IS NULL OR length(k)>200 OR ev NOT IN ('purchase','activate','upgrade','downgrade','deactivate','migrate') OR ts IS NULL THEN RAISE EXCEPTION 'Invalid license event'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('appsumo-licensing',0));
 INSERT INTO public.appsumo_license_events(license_key,event,event_timestamp,is_test,payload) VALUES(k,ev,ts,test_mode,payload) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN jsonb_build_object('duplicate',true); END IF;
 SELECT * INTO old FROM public.appsumo_licenses WHERE license_key=k FOR UPDATE;
 IF old.license_key IS NOT NULL AND old.is_test<>test_mode THEN RAISE EXCEPTION 'Test and customer licenses cannot mix'; END IF;
 IF old.license_key IS NOT NULL AND ts<old.event_timestamp THEN RETURN jsonb_build_object('stale',true); END IF;
 IF prev IS NOT NULL AND prev<>k THEN
  SELECT * INTO prior FROM public.appsumo_licenses WHERE license_key=prev FOR UPDATE;
  IF prior.license_key IS NOT NULL AND prior.is_test<>test_mode THEN RAISE EXCEPTION 'Test and customer licenses cannot mix'; END IF;
 END IF;
 owner_id:=coalesce(old.user_id,prior.user_id);
 state:=CASE WHEN ev='purchase' THEN 'inactive' WHEN ev='deactivate' THEN 'deactivated' ELSE 'active' END;
 INSERT INTO public.appsumo_licenses(license_key,user_id,license_status,tier,is_test,prev_license_key,parent_license_key,partner_plan_name,unit_quantity,event_timestamp,raw_payload,credits_granted,revoked_balance)
 VALUES(k,owner_id,state,coalesce((payload->>'tier')::integer,old.tier,prior.tier,1),test_mode,prev,nullif(payload->>'parent_license_key',''),payload->>'partner_plan_name',(payload->>'unit_quantity')::integer,ts,payload,coalesce(old.credits_granted,prior.credits_granted,false),coalesce(old.revoked_balance,prior.revoked_balance,0))
 ON CONFLICT(license_key) DO UPDATE SET license_status=excluded.license_status,tier=excluded.tier,user_id=excluded.user_id,parent_license_key=coalesce(excluded.parent_license_key,appsumo_licenses.parent_license_key),prev_license_key=coalesce(excluded.prev_license_key,appsumo_licenses.prev_license_key),partner_plan_name=coalesce(excluded.partner_plan_name,appsumo_licenses.partner_plan_name),unit_quantity=coalesce(excluded.unit_quantity,appsumo_licenses.unit_quantity),event_timestamp=ts,raw_payload=payload,updated_at=now();
 IF prior.license_key IS NOT NULL THEN UPDATE public.appsumo_licenses SET license_status='deactivated',updated_at=now() WHERE license_key=prev; END IF;
 IF owner_id IS NOT NULL AND NOT test_mode THEN PERFORM public.appsumo_sync_subscription(owner_id); END IF;
 RETURN jsonb_build_object('applied',true,'license_status',state);
END; $$;
REVOKE ALL ON FUNCTION public.appsumo_apply_event(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.appsumo_apply_event(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.appsumo_claim_license(claim_hash text,owner_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE claim public.appsumo_redemption_claims; lic public.appsumo_licenses;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('appsumo-licensing',0));
 SELECT * INTO claim FROM public.appsumo_redemption_claims WHERE token_hash=claim_hash FOR UPDATE;
 IF claim.token_hash IS NULL OR claim.expires_at<now() OR (claim.consumed_by IS NOT NULL AND claim.consumed_by<>owner_id) THEN RAISE EXCEPTION 'Redemption has expired or was already used'; END IF;
 SELECT * INTO lic FROM public.appsumo_licenses WHERE license_key=claim.license_key FOR UPDATE;
 IF lic.is_test OR lic.license_status<>'active' OR lic.parent_license_key IS NOT NULL THEN RAISE EXCEPTION 'License is not redeemable'; END IF;
 IF lic.user_id IS NOT NULL AND lic.user_id<>owner_id THEN RAISE EXCEPTION 'License belongs to a different account'; END IF;
 IF EXISTS(SELECT 1 FROM public.appsumo_licenses WHERE user_id=owner_id AND license_status='active' AND license_key<>lic.license_key AND parent_license_key IS NULL) THEN RAISE EXCEPTION 'This account already has an active license'; END IF;
 UPDATE public.appsumo_licenses SET user_id=owner_id,updated_at=now() WHERE license_key=lic.license_key;
 PERFORM public.appsumo_sync_subscription(owner_id);
 UPDATE public.appsumo_redemption_claims SET consumed_by=owner_id,consumed_at=coalesce(consumed_at,now()) WHERE token_hash=claim_hash;
 RETURN jsonb_build_object('success',true,'tier',lic.tier);
END; $$;
REVOKE ALL ON FUNCTION public.appsumo_claim_license(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.appsumo_claim_license(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.appsumo_refresh_credits() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s record; n integer:=0;
BEGIN
 FOR s IN SELECT sub.id,sub.user_id,cfg.credits FROM public.subscriptions sub JOIN public.appsumo_licenses l ON l.license_key=sub.appsumo_license_key JOIN public.appsumo_plan_config cfg ON cfg.tier=l.tier WHERE l.license_status='active' AND NOT l.is_test AND cfg.renewal='monthly' AND sub.credits_reset_at<=now() FOR UPDATE OF sub SKIP LOCKED LOOP
  UPDATE public.subscriptions SET search_credits_remaining=s.credits,credits_reset_at=now()+interval '1 month',updated_at=now() WHERE id=s.id;
  n:=n+1;
 END LOOP;
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.appsumo_refresh_credits() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.appsumo_refresh_credits() TO service_role;
CREATE OR REPLACE FUNCTION public.protect_appsumo_subscription_link() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.appsumo_license_key IS NOT NULL AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN RAISE EXCEPTION 'License links are server-managed'; END IF;
 ELSIF NEW.appsumo_license_key IS DISTINCT FROM OLD.appsumo_license_key AND current_user NOT IN ('postgres','service_role','supabase_admin') THEN RAISE EXCEPTION 'License links are server-managed'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.protect_appsumo_subscription_link() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_appsumo_subscription_link BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.protect_appsumo_subscription_link();
DO $health$ DECLARE def text:=pg_get_functiondef('public._system_health_checks()'::regprocedure); BEGIN
 IF position('AND NOT billing_exempt' IN def)=0 THEN RAISE EXCEPTION 'Billing health predicate changed'; END IF;
 EXECUTE replace(def,'AND NOT billing_exempt','AND NOT billing_exempt AND appsumo_license_key IS NULL');
END; $health$;
INSERT INTO public.schema_contract(table_name,column_name,note) SELECT table_name,column_name,'AppSumo licensing contract' FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('appsumo_licenses','appsumo_license_events','appsumo_redemption_claims','appsumo_plan_config') ON CONFLICT(table_name,column_name) DO NOTHING;
INSERT INTO public.schema_contract(table_name,column_name,note) VALUES('subscriptions','appsumo_license_key','Server-managed lifetime licensing source') ON CONFLICT(table_name,column_name) DO NOTHING;