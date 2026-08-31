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
    -- Postgres grants EXECUTE to PUBLIC by default, which the earlier
    -- role-scoped REVOKE could not remove. Drop it, then hand back exactly
    -- the access the app needs.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);

    IF r.proname = ANY(keep_anon) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
    END IF;

    IF r.proname = ANY(keep_auth) OR r.proname LIKE 'admin\_%' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
  END LOOP;
END $$;