-- 1. Blog posts: public read limited to already-published posts
DROP POLICY IF EXISTS "Anyone can read blog posts" ON public.blog_posts;
CREATE POLICY "Anyone can read published blog posts"
ON public.blog_posts
FOR SELECT
TO anon, authenticated
USING (published_at <= now());

-- 2. Deliverability settings: scoped admin read, keep service_role
CREATE POLICY "Admins can read deliverability settings"
ON public.deliverability_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT ON public.deliverability_settings TO authenticated;

-- 3. Sequence steps: ownership must always be set
UPDATE public.sequence_steps st
SET user_id = s.user_id
FROM public.email_sequences s
WHERE st.sequence_id = s.id AND st.user_id IS NULL;

DELETE FROM public.sequence_steps WHERE user_id IS NULL;

ALTER TABLE public.sequence_steps ALTER COLUMN user_id SET NOT NULL;