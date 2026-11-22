CREATE TABLE public.mailchimp_signup_imports (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
 opted_in boolean NOT NULL,
 consent_source text NOT NULL DEFAULT 'onboarding',
 consent_version text NOT NULL DEFAULT '2026-11-21',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','synced','skipped','failed')),
 attempts integer NOT NULL DEFAULT 0,
 member_status text,
 error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.mailchimp_signup_imports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.mailchimp_signup_imports TO authenticated;
GRANT ALL ON public.mailchimp_signup_imports TO service_role;
ALTER TABLE public.mailchimp_signup_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own newsletter preference" ON public.mailchimp_signup_imports FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE INDEX mailchimp_signup_pending_idx ON public.mailchimp_signup_imports(created_at) WHERE status='pending';
CREATE FUNCTION public.record_marketing_email_consent(p_opt_in boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
 IF v_user IS NULL OR p_opt_in IS NULL THEN RAISE EXCEPTION 'Authenticated explicit preference required'; END IF;
 INSERT INTO public.mailchimp_signup_imports(user_id,opted_in,status)
 VALUES(v_user,p_opt_in,CASE WHEN p_opt_in THEN 'pending' ELSE 'skipped' END)
 ON CONFLICT(user_id) DO UPDATE SET opted_in=EXCLUDED.opted_in,
 status=CASE WHEN NOT EXCLUDED.opted_in THEN 'skipped' WHEN mailchimp_signup_imports.opted_in THEN mailchimp_signup_imports.status ELSE 'pending' END,
 updated_at=CASE WHEN mailchimp_signup_imports.opted_in IS DISTINCT FROM EXCLUDED.opted_in THEN now() ELSE mailchimp_signup_imports.updated_at END;
END $$;
REVOKE ALL ON FUNCTION public.record_marketing_email_consent(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_marketing_email_consent(boolean) TO authenticated;
CREATE FUNCTION public.wake_mailchimp_signup_import() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_base text;
BEGIN
 IF NEW.status<>'pending' OR NOT NEW.opted_in THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status='pending' AND OLD.opted_in THEN RETURN NEW; END IF;
 SELECT substring(command FROM 'https://[^''[:space:]]+/functions/v1/') INTO v_base FROM cron.job WHERE jobname='auto-generate-blog-post';
 IF v_base IS NOT NULL THEN
 BEGIN
 PERFORM net.http_post(url:=v_base||'send-blog-newsletter',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||public.internal_job_key()),body:='{}'::jsonb,timeout_milliseconds:=120000);
 EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Signup email import wake failed; email recovery will retry'; END;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.wake_mailchimp_signup_import() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER wake_signup_email_import AFTER INSERT OR UPDATE OF opted_in ON public.mailchimp_signup_imports FOR EACH ROW EXECUTE FUNCTION public.wake_mailchimp_signup_import();
CREATE FUNCTION public.claim_mailchimp_signup_import() RETURNS TABLE(user_id uuid,email text,updated_at timestamptz,attempts integer) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 WITH chosen AS (
 SELECT q.user_id FROM public.mailchimp_signup_imports q JOIN auth.users u ON u.id=q.user_id
 WHERE q.opted_in AND q.status='pending' AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
 ORDER BY q.created_at,q.user_id FOR UPDATE OF q SKIP LOCKED LIMIT 1
 ), claimed AS (
 UPDATE public.mailchimp_signup_imports q SET status='processing',attempts=q.attempts+1,updated_at=clock_timestamp()
 FROM chosen WHERE q.user_id=chosen.user_id RETURNING q.user_id,q.updated_at,q.attempts
 ) SELECT c.user_id,u.email::text,c.updated_at,c.attempts FROM claimed c JOIN auth.users u ON u.id=c.user_id;
$$;
REVOKE ALL ON FUNCTION public.claim_mailchimp_signup_import() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mailchimp_signup_import() TO service_role;
INSERT INTO public.schema_contract(table_name,column_name,note)
SELECT 'mailchimp_signup_imports',column_name,'Consent-aware new-signup newsletter imports' FROM information_schema.columns WHERE table_schema='public' AND table_name='mailchimp_signup_imports' ON CONFLICT(table_name,column_name) DO NOTHING;
NOTIFY pgrst,'reload schema';