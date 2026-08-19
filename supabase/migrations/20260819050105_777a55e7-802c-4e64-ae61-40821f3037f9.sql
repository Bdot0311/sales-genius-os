REVOKE ALL ON FUNCTION public.enforce_signup_email_policy() FROM PUBLIC, anon, authenticated;

-- Remove the automated audit/scanner accounts that slipped through
DELETE FROM auth.users WHERE email ILIKE 'audit-%@emalupe.com';