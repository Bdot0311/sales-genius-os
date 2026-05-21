-- Add CAN-SPAM compliance fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS physical_address TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS include_unsubscribe BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS include_compliance_footer BOOLEAN DEFAULT TRUE;

-- Add email signature column if not exists (also used in Settings)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_signature TEXT DEFAULT NULL;
