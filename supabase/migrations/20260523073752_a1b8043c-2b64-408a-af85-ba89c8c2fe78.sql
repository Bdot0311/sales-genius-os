
-- Defense-in-depth: explicit RESTRICTIVE deny policies for sensitive operational tables.
-- service_role bypasses RLS, so legitimate ingestion/processing is unaffected.

-- email_send_log: block all access from anon/authenticated
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN NULL; END $$;

DROP POLICY IF EXISTS "Deny all access to email_send_log" ON public.email_send_log;
CREATE POLICY "Deny all access to email_send_log"
  ON public.email_send_log
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- signup_diagnostics: block insert/update/delete from anon/authenticated (admin SELECT remains)
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.signup_diagnostics ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN NULL; END $$;

DROP POLICY IF EXISTS "Deny writes to signup_diagnostics" ON public.signup_diagnostics;
CREATE POLICY "Deny writes to signup_diagnostics"
  ON public.signup_diagnostics
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny updates to signup_diagnostics" ON public.signup_diagnostics;
CREATE POLICY "Deny updates to signup_diagnostics"
  ON public.signup_diagnostics
  AS RESTRICTIVE
  FOR UPDATE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny deletes to signup_diagnostics" ON public.signup_diagnostics;
CREATE POLICY "Deny deletes to signup_diagnostics"
  ON public.signup_diagnostics
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- stripe_webhook_events: explicit insert/delete deny (admin SELECT/UPDATE remains)
DO $$ BEGIN
  EXECUTE 'ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN NULL; END $$;

DROP POLICY IF EXISTS "Deny inserts to stripe_webhook_events" ON public.stripe_webhook_events;
CREATE POLICY "Deny inserts to stripe_webhook_events"
  ON public.stripe_webhook_events
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny deletes to stripe_webhook_events" ON public.stripe_webhook_events;
CREATE POLICY "Deny deletes to stripe_webhook_events"
  ON public.stripe_webhook_events
  AS RESTRICTIVE
  FOR DELETE
  TO anon, authenticated
  USING (false);
