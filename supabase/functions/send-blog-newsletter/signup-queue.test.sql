-- Rollback-only test; trigger HTTP requests also roll back. No subscribers imported.
BEGIN;
DO $$
DECLARE u uuid; claimed record;
BEGIN
 SELECT p.id INTO u FROM public.profiles p JOIN auth.users a ON a.id=p.id WHERE a.email_confirmed_at IS NOT NULL LIMIT 1;
 IF u IS NULL THEN RAISE EXCEPTION 'A confirmed fixture account is required'; END IF;
 IF EXISTS(SELECT 1 FROM public.mailchimp_signup_imports) THEN RAISE EXCEPTION 'Run this isolation test before real signup imports'; END IF;
 PERFORM set_config('request.jwt.claim.sub',u::text,true);
 PERFORM public.record_marketing_email_consent(false);
 IF EXISTS(SELECT 1 FROM public.claim_mailchimp_signup_import()) THEN RAISE EXCEPTION 'Declining must not import'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.mailchimp_signup_imports WHERE user_id=u AND NOT opted_in AND status='skipped') THEN RAISE EXCEPTION 'Explicit decline must be recorded'; END IF;
 PERFORM public.record_marketing_email_consent(true);
 SELECT * INTO claimed FROM public.claim_mailchimp_signup_import();
 IF claimed.user_id IS DISTINCT FROM u OR claimed.attempts<>1 OR claimed.email IS NULL THEN RAISE EXCEPTION 'Confirmed opt-in must atomically claim the real owned email'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_mailchimp_signup_import()) THEN RAISE EXCEPTION 'Concurrent claims must not repeat imports'; END IF;
 PERFORM public.record_marketing_email_consent(true);
 IF (SELECT status FROM public.mailchimp_signup_imports WHERE user_id=u)<>'processing' THEN RAISE EXCEPTION 'Repeated consent must not reset processing'; END IF;
 PERFORM public.record_marketing_email_consent(false);
 IF (SELECT status FROM public.mailchimp_signup_imports WHERE user_id=u)<>'skipped' THEN RAISE EXCEPTION 'Later decline must cancel pending work'; END IF;
 IF has_table_privilege('authenticated','public.mailchimp_signup_imports','INSERT,UPDATE,DELETE') OR has_table_privilege('anon','public.mailchimp_signup_imports','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Queue writes must be private'; END IF;
 IF has_function_privilege('authenticated','public.claim_mailchimp_signup_import()','EXECUTE') OR has_function_privilege('anon','public.record_marketing_email_consent(boolean)','EXECUTE') THEN RAISE EXCEPTION 'Claim must be service-only and recording must require sign-in'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 BEGIN
 PERFORM public.record_marketing_email_consent(true);
 RAISE EXCEPTION 'Anonymous consent was accepted';
 EXCEPTION WHEN OTHERS THEN
 IF SQLERRM<>'Authenticated explicit preference required' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'Nine consent queue and permission checks passed';
END $$;
ROLLBACK;