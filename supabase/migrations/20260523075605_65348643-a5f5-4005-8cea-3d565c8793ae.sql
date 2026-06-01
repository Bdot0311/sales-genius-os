-- Explicit service-role INSERT policies (documents and enforces write paths)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='login_history' AND policyname='service_role_insert_login_history') THEN
    CREATE POLICY service_role_insert_login_history ON public.login_history
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='system_alerts' AND policyname='service_role_insert_system_alerts') THEN
    CREATE POLICY service_role_insert_system_alerts ON public.system_alerts
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='topup_payments' AND policyname='service_role_insert_topup_payments') THEN
    CREATE POLICY service_role_insert_topup_payments ON public.topup_payments
      FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppressed_emails' AND policyname='service_role_update_suppressed_emails') THEN
    CREATE POLICY service_role_update_suppressed_emails ON public.suppressed_emails
      FOR UPDATE TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='suppressed_emails' AND policyname='service_role_delete_suppressed_emails') THEN
    CREATE POLICY service_role_delete_suppressed_emails ON public.suppressed_emails
      FOR DELETE TO service_role USING (true);
  END IF;
END $$;