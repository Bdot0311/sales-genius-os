
-- 1. Revoke EXECUTE on every public SECURITY DEFINER function from PUBLIC/anon/authenticated.
--    Re-grant to service_role so triggers, cron jobs, and edge functions still work.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || r.sig || ' TO service_role';
  END LOOP;
END $$;

-- 2. Re-grant EXECUTE to `authenticated` for functions the signed-in app legitimately calls.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_search_credits(integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_leads_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_webhook_secret(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_api_key_value(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_email_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sequence_monthly_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_send_trend(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unlock_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_subscription(uuid, subscription_plan, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_lock_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_trial(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_seo_dashboard() TO authenticated;

-- 3. Public-facing maintenance helpers (unauth landing pages need to read these).
GRANT EXECUTE ON FUNCTION public.get_maintenance_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_maintenance_message() TO anon, authenticated;

-- 4. Small immutable utility helpers (safe to keep reachable from app code).
GRANT EXECUTE ON FUNCTION public.current_month_start_utc() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_month_start_utc() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_email_limit(subscription_plan) TO authenticated;
