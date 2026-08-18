-- Lead email verification.
--
-- Nothing has ever checked whether a lead's email can receive mail. The
-- "Verified emails only" toggle in BulkSendDialog filtered on `email_verified`,
-- a column that did not exist, so `undefined !== false` passed every lead
-- through and the filter was a no-op. These columns make it real.
--
-- Vocabulary (see supabase/functions/_shared/email-verify.ts):
--   valid      mailbox confirmed to accept mail (SMTP handshake)
--   catch_all  domain accepts everything; the mailbox itself is unproven
--   unknown    checks were inconclusive, or no paid verifier is configured
--   invalid    syntax failure, disposable domain, no MX, or SMTP rejection
--   role       shared mailbox (info@, sales@) — deliverable but high complaint risk
--
-- email_verified is the single boolean the UI gates on: true only for `valid`,
-- false only for `invalid`, NULL for everything unproven. Three states matter —
-- a two-state boolean cannot distinguish "known bad" from "not checked yet",
-- and collapsing them would either hide good leads or ship bounces.

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

-- The list view filters "show me only leads I can actually email", which is
-- user_id + a status test. Partial index: rows never checked are the ones the
-- filter excludes anyway, so they do not need to be in the index.
CREATE INDEX IF NOT EXISTS idx_leads_email_verification
  ON public.leads (user_id, email_verification_status)
  WHERE email_verification_status IS NOT NULL;

COMMENT ON COLUMN public.leads.email_verified IS
  'true = mailbox confirmed, false = confirmed undeliverable, NULL = unproven. Gates the send filters.';
COMMENT ON COLUMN public.leads.email_verification_status IS
  'valid | catch_all | unknown | invalid | role. See _shared/email-verify.ts.';
