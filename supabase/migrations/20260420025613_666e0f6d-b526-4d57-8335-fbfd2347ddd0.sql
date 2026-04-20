
-- Expand audit logging to capture signups, subscription changes, and integration connects
-- so the admin Activity page reflects real recent user activity (not only lead/deal CRUD).

CREATE TRIGGER audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();

CREATE TRIGGER audit_subscriptions
AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();

CREATE TRIGGER audit_integrations
AFTER INSERT OR UPDATE OR DELETE ON public.integrations
FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();

CREATE TRIGGER audit_sent_emails
AFTER INSERT ON public.sent_emails
FOR EACH ROW EXECUTE FUNCTION public.log_audit_trail();
