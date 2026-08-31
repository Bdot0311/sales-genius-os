DO $$
DECLARE
  r record;
  keep_auth text[] := ARRAY[
    'has_role','has_active_support_grant','webhook_has_secret','webhook_secret_masked',
    'is_demo_mode','deduct_search_credits','get_deliverability_live_stats','get_email_send_trend',
    'get_maintenance_message','get_maintenance_status','get_monthly_email_usage','get_monthly_email_limit',
    'get_sequence_monthly_usage','get_user_leads_usage','get_user_plan','get_webhook_secret',
    'record_user_login','seed_objection_entries','touch_last_active','agency_client_stats',
    'get_my_referral_code','current_month_start_utc','next_month_start_utc'
  ];
  keep_anon text[] := ARRAY[
    'has_role','has_active_support_grant','get_maintenance_message','get_maintenance_status',
    'current_month_start_utc','next_month_start_utc'
  ];
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    -- Signed-out callers never need any SECURITY DEFINER routine beyond the public few.
    IF NOT (r.proname = ANY(keep_anon)) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    END IF;

    -- Signed-in callers keep only the routines the app actually calls plus
    -- self-guarded admin_* reporting routines (each re-checks has_role inside).
    IF NOT (r.proname = ANY(keep_auth)) AND r.proname NOT LIKE 'admin\_%' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    END IF;
  END LOOP;
END $$;

-- Keep the internal cron credential in sync with the current server secret.
-- A stale vault value silently 401s every background job (scheduled emails,
-- webhook dispatch, Stripe retries, suspicious-activity scans), so refresh it
-- daily rather than waiting for the next outage to notice.
DO $$
BEGIN
  PERFORM cron.unschedule('sync-internal-trigger-secret-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sync-internal-trigger-secret-daily',
  '10 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ghgfjnepvxvxrncmskys.supabase.co/functions/v1/sync-vault-service-key',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := '{}'::jsonb
  );
  $$
);