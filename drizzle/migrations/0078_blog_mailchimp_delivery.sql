CREATE TABLE public.blog_mailchimp_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 post_id uuid NOT NULL UNIQUE REFERENCES public.blog_posts(id) ON DELETE CASCADE,
 article jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sending','accepted','failed','needs_review')),
 campaign_id text,
 error text,
 available_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_mailchimp_deliveries TO authenticated;
GRANT ALL ON public.blog_mailchimp_deliveries TO service_role;
ALTER TABLE public.blog_mailchimp_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Administrators read blog delivery history" ON public.blog_mailchimp_deliveries FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX blog_mailchimp_pending_idx ON public.blog_mailchimp_deliveries(available_at) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.queue_blog_mailchimp_delivery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_base text;
BEGIN
 IF NEW.source NOT IN ('ai','opinly') OR NEW.published_at IS NULL OR NEW.published_at < TG_ARGV[0]::timestamptz OR length(trim(NEW.content)) = 0 THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' AND OLD.published_at IS NOT NULL THEN RETURN NEW; END IF;
 INSERT INTO public.blog_mailchimp_deliveries(post_id, article, available_at)
 VALUES(NEW.id, jsonb_build_object('title',NEW.title,'description',NEW.description,'content',NEW.content,'slug',NEW.slug,'published_at',NEW.published_at), NEW.published_at)
 ON CONFLICT(post_id) DO NOTHING;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT substring(command FROM 'https://[^''[:space:]]+/functions/v1/') INTO v_base FROM cron.job WHERE jobname = 'auto-generate-blog-post';
 IF v_base IS NOT NULL AND NEW.published_at <= now() THEN
  BEGIN
   PERFORM net.http_post(url := v_base || 'send-blog-newsletter', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || public.internal_job_key()), body := '{}'::jsonb, timeout_milliseconds := 120000);
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Blog email wake failed; hourly recovery will pick up pending delivery'; END;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.queue_blog_mailchimp_delivery() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
 EXECUTE format('CREATE TRIGGER queue_new_blog_email AFTER INSERT OR UPDATE OF published_at ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.queue_blog_mailchimp_delivery(%L)', now()::text);
END $$;

CREATE OR REPLACE FUNCTION public.claim_blog_mailchimp_delivery() RETURNS SETOF public.blog_mailchimp_deliveries LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 UPDATE public.blog_mailchimp_deliveries SET status='processing', updated_at=now()
 WHERE id = (SELECT id FROM public.blog_mailchimp_deliveries WHERE status='pending' AND available_at <= now() ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
 RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_blog_mailchimp_delivery() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_blog_mailchimp_delivery() TO service_role;

INSERT INTO public.schema_contract(table_name,column_name,note)
SELECT 'blog_mailchimp_deliveries',column_name,'Once-only full-article Mailchimp blog delivery' FROM information_schema.columns WHERE table_schema='public' AND table_name='blog_mailchimp_deliveries'
ON CONFLICT(table_name,column_name) DO NOTHING;
DO $$
DECLARE v_base text;
BEGIN
 SELECT substring(command FROM 'https://[^''[:space:]]+/functions/v1/') INTO v_base FROM cron.job WHERE jobname='auto-generate-blog-post';
 IF v_base IS NULL THEN RAISE EXCEPTION 'Configured blog function address missing'; END IF;
 PERFORM cron.schedule('blog-mailchimp-recovery-hourly','45 * * * *',format($job$SELECT net.http_post(url := %L, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || public.internal_job_key()), body := '{}'::jsonb, timeout_milliseconds := 120000);$job$, v_base || 'send-blog-newsletter'));
END $$;
NOTIFY pgrst, 'reload schema';