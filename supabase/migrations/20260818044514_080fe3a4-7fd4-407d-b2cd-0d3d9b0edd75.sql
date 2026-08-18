ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_verified boolean,
  ADD COLUMN IF NOT EXISTS email_verification_status text,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.leads
    ADD CONSTRAINT leads_email_verification_status_check
    CHECK (email_verification_status IS NULL OR email_verification_status IN
      ('valid', 'catch_all', 'unknown', 'invalid', 'role'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_email_verification
  ON public.leads (user_id, email_verification_status)
  WHERE email_verification_status IS NOT NULL;

COMMENT ON COLUMN public.leads.email_verified IS
  'true = mailbox confirmed, false = confirmed undeliverable, NULL = unproven. Gates the send filters.';
COMMENT ON COLUMN public.leads.email_verification_status IS
  'valid | catch_all | unknown | invalid | role. See _shared/email-verify.ts.';
