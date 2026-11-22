CREATE OR REPLACE FUNCTION public.enforce_admin_billing_exemption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 NEW.billing_exempt := EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id AND role='admin');
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_customer_stripe_linkage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id AND role='admin')
 AND NEW.plan <> 'free'
 AND (COALESCE(NEW.stripe_customer_id,'') !~ '^cus_[A-Za-z0-9]+$' OR COALESCE(NEW.stripe_subscription_id,'') !~ '^sub_[A-Za-z0-9]+$') THEN
  RAISE EXCEPTION 'A Stripe subscription is required before activating a paid plan' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_customer_stripe_linkage() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_customer_stripe_linkage BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_stripe_linkage();

CREATE OR REPLACE FUNCTION public.sync_admin_billing_exemption()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP <> 'INSERT' THEN
  IF OLD.role='admin' THEN
   IF NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=OLD.user_id AND r.role='admin')
   AND EXISTS(SELECT 1 FROM public.subscriptions s WHERE s.user_id=OLD.user_id AND s.plan<>'free' AND (COALESCE(s.stripe_customer_id,'') !~ '^cus_[A-Za-z0-9]+$' OR COALESCE(s.stripe_subscription_id,'') !~ '^sub_[A-Za-z0-9]+$')) THEN
    PERFORM public.billing_downgrade_to_free(OLD.user_id,'Administrator exemption removed; Stripe signup required',jsonb_build_object('trigger','admin_role_removed'));
   END IF;
   UPDATE public.subscriptions SET billing_exempt=EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=OLD.user_id AND r.role='admin') WHERE user_id=OLD.user_id;
  END IF;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  IF NEW.role='admin' THEN UPDATE public.subscriptions SET billing_exempt=true WHERE user_id=NEW.user_id; END IF;
 END IF;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.appsumo_sync_subscription(owner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE lic public.appsumo_licenses; sub public.subscriptions;
BEGIN
 SELECT * INTO sub FROM public.subscriptions WHERE user_id=owner_id FOR UPDATE;
 IF sub.id IS NULL THEN RAISE EXCEPTION 'Account subscription is unavailable'; END IF;
 IF public.has_role(owner_id,'admin') THEN RETURN; END IF;
 SELECT * INTO lic FROM public.appsumo_licenses WHERE user_id=owner_id AND license_status='active' AND NOT is_test AND parent_license_key IS NULL ORDER BY event_timestamp DESC LIMIT 1;
 -- Licensing records attribution only. Stripe checkout/events own every paid entitlement.
 UPDATE public.subscriptions SET appsumo_license_key=lic.license_key,updated_at=now() WHERE id=sub.id AND appsumo_license_key IS DISTINCT FROM lic.license_key;
END $$;
REVOKE ALL ON FUNCTION public.appsumo_sync_subscription(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.appsumo_sync_subscription(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.appsumo_refresh_credits()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT 0; $$;
REVOKE ALL ON FUNCTION public.appsumo_refresh_credits() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.appsumo_refresh_credits() TO service_role;
COMMENT ON FUNCTION public.appsumo_refresh_credits() IS 'Compatibility no-op: Stripe billing cycles exclusively control customer credit renewal.';
COMMENT ON COLUMN public.subscriptions.appsumo_license_key IS 'Server-managed AppSumo attribution only; never grants a paid tier or renews credits without Stripe signup.';

DO $health$
DECLARE def text:=pg_get_functiondef('public._system_health_checks()'::regprocedure);
BEGIN
 IF position('AND NOT billing_exempt AND appsumo_license_key IS NULL' IN def)=0 THEN RAISE EXCEPTION 'Billing health predicate changed'; END IF;
 EXECUTE replace(def,'AND NOT billing_exempt AND appsumo_license_key IS NULL','AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=subscriptions.user_id AND r.role=''admin'')');
END $health$;