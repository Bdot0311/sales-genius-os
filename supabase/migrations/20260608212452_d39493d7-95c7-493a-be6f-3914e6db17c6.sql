
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'audit_logs',
    'login_history',
    'security_events',
    'blocked_ips',
    'rate_limit_buckets',
    'search_transactions',
    'seo_issues',
    'seo_audit_runs',
    'signup_diagnostics',
    'stripe_webhook_events',
    'admin_settings',
    'feature_flags'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    -- REPLICA IDENTITY FULL so UPDATE/DELETE payloads include the full row
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
