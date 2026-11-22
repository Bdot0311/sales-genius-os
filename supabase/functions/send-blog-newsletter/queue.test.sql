-- Run in a rollback-only privileged session. Future publication prevents HTTP wakes.
BEGIN;
DO $$
DECLARE p uuid := gen_random_uuid(); old_p uuid := gen_random_uuid(); queued public.blog_mailchimp_deliveries; n int;
BEGIN
 INSERT INTO public.blog_posts(id,slug,title,description,content,source,published_at)
 VALUES(p,'mailchimp-regression-'||p,'Queue regression','Description','Exact full body','ai',now()+interval '1 day');
 SELECT count(*) INTO n FROM public.blog_mailchimp_deliveries WHERE post_id=p;
 IF n<>1 THEN RAISE EXCEPTION 'New generated publication must queue exactly once'; END IF;
 UPDATE public.blog_posts SET content='Edited full body',published_at=now()+interval '2 days' WHERE id=p;
 SELECT count(*) INTO n FROM public.blog_mailchimp_deliveries WHERE post_id=p;
 IF n<>1 THEN RAISE EXCEPTION 'Edits must not queue a second send'; END IF;
 IF (SELECT article->>'content' FROM public.blog_mailchimp_deliveries WHERE post_id=p)<>'Exact full body' THEN RAISE EXCEPTION 'Published snapshot must remain unchanged'; END IF;
 INSERT INTO public.blog_posts(id,slug,title,description,content,source,published_at)
 VALUES(old_p,'mailchimp-old-regression-'||old_p,'Old import','Description','Historical body','opinly',now()-interval '1 year');
 IF EXISTS(SELECT 1 FROM public.blog_mailchimp_deliveries WHERE post_id=old_p) THEN RAISE EXCEPTION 'Historical imports must not be emailed'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_blog_mailchimp_delivery() WHERE post_id=p) THEN RAISE EXCEPTION 'Future publications must wait'; END IF;
 UPDATE public.blog_mailchimp_deliveries SET available_at=now()-interval '1 minute' WHERE post_id=p;
 SELECT * INTO queued FROM public.claim_blog_mailchimp_delivery();
 IF queued.post_id IS DISTINCT FROM p OR queued.status<>'processing' THEN RAISE EXCEPTION 'Due publication must atomically claim'; END IF;
 IF EXISTS(SELECT 1 FROM public.claim_blog_mailchimp_delivery() WHERE post_id=p) THEN RAISE EXCEPTION 'Claimed publication must not be reclaimed'; END IF;
 IF has_function_privilege('authenticated','public.claim_blog_mailchimp_delivery()','EXECUTE') OR has_function_privilege('anon','public.claim_blog_mailchimp_delivery()','EXECUTE') THEN RAISE EXCEPTION 'Customers cannot claim sends'; END IF;
 IF has_table_privilege('authenticated','public.blog_mailchimp_deliveries','INSERT,UPDATE,DELETE') OR has_table_privilege('anon','public.blog_mailchimp_deliveries','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Queue writes must stay private'; END IF;
 RAISE NOTICE 'Eight blog queue and permission regressions passed';
END $$;
ROLLBACK;