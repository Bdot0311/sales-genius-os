
-- 1) Remove sensitive admin/security tables from the realtime publication.
--    These have admin-only or restrictive RLS; they don't need live broadcast.
ALTER PUBLICATION supabase_realtime DROP TABLE public.audit_logs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.security_events;
ALTER PUBLICATION supabase_realtime DROP TABLE public.signup_diagnostics;
ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_settings;
ALTER PUBLICATION supabase_realtime DROP TABLE public.blocked_ips;
ALTER PUBLICATION supabase_realtime DROP TABLE public.feature_flags;
ALTER PUBLICATION supabase_realtime DROP TABLE public.rate_limit_buckets;
ALTER PUBLICATION supabase_realtime DROP TABLE public.api_usage_log;
ALTER PUBLICATION supabase_realtime DROP TABLE public.webhook_deliveries;
ALTER PUBLICATION supabase_realtime DROP TABLE public.login_history;
ALTER PUBLICATION supabase_realtime DROP TABLE public.search_transactions;
ALTER PUBLICATION supabase_realtime DROP TABLE public.stripe_webhook_events;
ALTER PUBLICATION supabase_realtime DROP TABLE public.seo_audit_runs;

-- 2) Consolidate duplicate "Admins can view all rows" SELECT policies where a
--    named admin SELECT (or admin ALL) policy already covers the same access.
DROP POLICY IF EXISTS "Admins can view all rows" ON public.admin_settings;
DROP POLICY IF EXISTS "Admins can view all rows" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view all rows" ON public.blocked_ips;
DROP POLICY IF EXISTS "Admins can view all rows" ON public.feature_flags;
DROP POLICY IF EXISTS "Admins can view all rows" ON public.login_history;
DROP POLICY IF EXISTS "Admins can view all rows" ON public.security_events;
DROP POLICY IF EXISTS "Admins can view all rows" ON public.seo_audit_runs;
DROP POLICY IF EXISTS "Admins can view all rows" ON public.signup_diagnostics;
DROP POLICY IF EXISTS "Admins can view all rows" ON public.stripe_webhook_events;
