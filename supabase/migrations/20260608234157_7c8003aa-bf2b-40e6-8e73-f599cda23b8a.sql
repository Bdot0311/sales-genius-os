
-- 1) Remove sensitive admin-only tables from the supabase_realtime publication.
-- These tables are admin/system-scoped and should not broadcast to authenticated clients.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'stripe_webhook_events',
    'security_events',
    'login_history',
    'audit_logs',
    'admin_settings',
    'feature_flags',
    'blocked_ips'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END$$;

-- 2) Harden suppressed_emails: add explicit RESTRICTIVE policy denying SELECT to anon/authenticated.
-- Service role bypasses RLS so backend code is unaffected.
DROP POLICY IF EXISTS "Deny direct reads of suppressed_emails" ON public.suppressed_emails;
CREATE POLICY "Deny direct reads of suppressed_emails"
ON public.suppressed_emails
AS RESTRICTIVE
FOR SELECT
TO anon, authenticated
USING (false);
