
-- 1. Tighten SELECT on sequence_steps to also verify parent sequence ownership
DROP POLICY IF EXISTS "Users can view own sequence steps" ON public.sequence_steps;
CREATE POLICY "Users can view own sequence steps"
ON public.sequence_steps
FOR SELECT
USING (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.email_sequences s
    WHERE s.id = sequence_steps.sequence_id
      AND s.user_id = auth.uid()
  )
);

-- 2. Remove admin/system tables from the realtime publication to eliminate the drift risk.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'admin_settings','feature_flags','blocked_ips','security_events','audit_logs',
    'signup_diagnostics','seo_audit_runs','seo_issues','api_usage_log',
    'webhook_deliveries','rate_limit_buckets','stripe_webhook_events',
    'login_history','search_transactions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
