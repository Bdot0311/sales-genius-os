-- Two fixes and two new columns, all in service of saving a lead successfully
-- and knowing what kind of number you got.
--
-- 1. contacts.email was declared globally UNIQUE — the same multi-tenant bug
--    that companies.domain had (fixed in 20260810180000). The first workspace
--    to save ada@acme.com makes that contact permanently unsaveable for every
--    other workspace. activateLead looks the contact up scoped to user_id,
--    finds nothing (RLS hides the other tenant's row), inserts, and fails on a
--    constraint naming a row the user is not allowed to see. A customer hit
--    this on companies; contacts is the next one they would have hit.
--
--    Safe to apply as-is: the constraint being dropped already guarantees no
--    two rows share an email, so no pair of existing rows can collide on the
--    narrower (user_id, email) key.
--
-- 2. contacts had no phone column at all, so a revealed number had nowhere to
--    go and was silently discarded on save.
--
-- 3. phone_type records whether a number is a mobile or an office line. The
--    providers already say which — Wiza splits mobile_phone from phone_number,
--    Bytemine mobile_phone from direct_dial — and we were collapsing both into
--    one field. It is also the closest honest answer to "is this on WhatsApp":
--    WhatsApp runs on mobiles, no provider sells a WhatsApp flag, so "mobile"
--    is a signal and "has WhatsApp" would be a claim we cannot support.

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_id_email_key
  ON public.contacts (user_id, email)
  WHERE email IS NOT NULL;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS phone_type text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS contact_phone_type text;

-- Unknown is a real answer here: a provider can hand back a number without
-- saying what kind it is, and guessing would put a "mobile" badge on a
-- switchboard. NULL means exactly that, and is the default.
DO $$
BEGIN
  ALTER TABLE public.contacts
    ADD CONSTRAINT contacts_phone_type_check
    CHECK (phone_type IS NULL OR phone_type IN ('mobile', 'office'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.leads
    ADD CONSTRAINT leads_contact_phone_type_check
    CHECK (contact_phone_type IS NULL OR contact_phone_type IN ('mobile', 'office'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.contacts.phone_type IS
  'mobile | office | NULL when the provider gave a number without a line type. Mobile is the WhatsApp-capable one.';
COMMENT ON COLUMN public.leads.contact_phone_type IS
  'mobile | office | NULL when unknown. See pick_phone() in the Railway backend.';
