CREATE OR REPLACE FUNCTION public.enforce_admin_billing_exemption() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=NEW.user_id AND role='admin') THEN NEW.billing_exempt := true; END IF; RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.enforce_admin_billing_exemption() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_admin_billing_exemption BEFORE INSERT OR UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_billing_exemption();
CREATE OR REPLACE FUNCTION public.sync_admin_billing_exemption() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF TG_OP <> 'INSERT' THEN IF OLD.role='admin' THEN UPDATE public.subscriptions SET billing_exempt=EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=OLD.user_id AND r.role='admin') WHERE user_id=OLD.user_id; END IF; END IF;
IF TG_OP <> 'DELETE' THEN IF NEW.role='admin' THEN UPDATE public.subscriptions SET billing_exempt=true WHERE user_id=NEW.user_id; END IF; END IF;
RETURN NULL; END; $$;
REVOKE ALL ON FUNCTION public.sync_admin_billing_exemption() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sync_admin_billing_exemption AFTER INSERT OR UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.sync_admin_billing_exemption();
DO $migration$ DECLARE definition text:=pg_get_functiondef('public._system_health_checks()'::regprocedure); old text:='AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);'; replacement text:=$predicate$AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)
AND NOT (
 c.relname IN ('stripe_credit_grants','outbound_gate_canary','visitor_resolve_jobs','visitor_network_cache','visitor_ip_cache')
 AND has_table_privilege('service_role',c.oid,'SELECT')
 AND has_table_privilege('service_role',c.oid,'INSERT')
 AND has_table_privilege('service_role',c.oid,'UPDATE')
 AND has_table_privilege('service_role',c.oid,'DELETE')
 AND NOT has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE')
 AND NOT has_table_privilege('authenticated',c.oid,'DELETE')
 AND NOT has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE')
 AND NOT has_table_privilege('anon',c.oid,'DELETE')
);$predicate$; BEGIN
IF position(old IN definition)=0 THEN RAISE EXCEPTION 'Policy health predicate changed; refusing unrelated replacement'; END IF;
EXECUTE replace(definition,old,replacement);
END; $migration$;