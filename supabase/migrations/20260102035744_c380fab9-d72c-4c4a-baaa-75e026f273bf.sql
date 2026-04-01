-- Add email signature column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_signature text;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.email_signature IS 'HTML email signature for outreach emails';