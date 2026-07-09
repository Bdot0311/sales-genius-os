
-- Ensure admin-only SELECT policies exist for each admin/system table, then re-add to realtime publication.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'admin_settings','api_usage_log','audit_logs','blocked_ips','feature_flags',
    'login_history','rate_limit_buckets','search_transactions','security_events',
    'seo_audit_runs','seo_issues','signup_diagnostics','stripe_webhook_events','webhook_deliveries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Admins can view all rows" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Admins can view all rows" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role))',
      t
    );
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;
