DO $$
DECLARE
  t text;
  tables text[] := ARRAY['audit_logs','login_history','security_events','sent_emails','signup_diagnostics','user_roles','subscriptions','blocked_ips','search_transactions'];
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