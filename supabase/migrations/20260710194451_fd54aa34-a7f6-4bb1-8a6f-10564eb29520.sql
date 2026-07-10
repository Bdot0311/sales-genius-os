
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'admin_settings','api_usage_log','audit_logs','blocked_ips','feature_flags',
    'login_history','rate_limit_buckets','search_transactions','security_events',
    'seo_audit_runs','signup_diagnostics','stripe_webhook_events','webhook_deliveries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
