-- email_send_log lost its API grant during an earlier hardening pass, which the
-- daily health check reports as "API access grants: 1 missing grants".
-- Row access stays admin-only through the existing RLS policy.
GRANT SELECT ON public.email_send_log TO authenticated;
GRANT ALL ON public.email_send_log TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'email_send_log'
  ) THEN
    EXECUTE $p$CREATE POLICY "Restrict email_send_log to admins"
      ON public.email_send_log FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))$p$;
  END IF;
END $$;