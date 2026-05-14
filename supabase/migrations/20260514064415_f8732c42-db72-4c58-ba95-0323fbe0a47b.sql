
-- blog_posts: public-readable content store
CREATE TABLE public.blog_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Sales Strategy',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  reading_time TEXT NOT NULL DEFAULT '5 min read',
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('static','ai','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_posts_published_at ON public.blog_posts(published_at DESC);
CREATE INDEX idx_blog_posts_slug ON public.blog_posts(slug);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read blog posts"
  ON public.blog_posts FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert blog posts"
  ON public.blog_posts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update blog posts"
  ON public.blog_posts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete blog posts"
  ON public.blog_posts FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- blog_topic_queue: SEO topic backlog the generator picks from
CREATE TABLE public.blog_topic_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  target_keyword TEXT NOT NULL,
  topic_brief TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Sales Strategy',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 100,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_blog_topic_queue_unused ON public.blog_topic_queue(priority ASC, created_at ASC) WHERE used_at IS NULL;

ALTER TABLE public.blog_topic_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read topic queue"
  ON public.blog_topic_queue FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage topic queue"
  ON public.blog_topic_queue FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed SEO topic queue (curated from prior keyword research)
INSERT INTO public.blog_topic_queue (target_keyword, topic_brief, category, keywords, priority) VALUES
  ('sales management software', 'Compare modern sales management software for small B2B teams. Cover what to look for, common pitfalls, and how an integrated outbound workflow beats a stack of point tools.', 'Sales Operations', ARRAY['sales management software','sales operations','sales ops tools','B2B sales software'], 10),
  ('sales operations', 'What sales operations actually does in 2026 — for founder-led teams without a dedicated SalesOps hire. Cover the workflow, the tooling, and the hand-offs.', 'Sales Operations', ARRAY['sales operations','sales ops','revenue operations','sales operations role'], 15),
  ('sales productivity software', 'How to evaluate sales productivity software when you''re a 1-5 person sales team. What actually moves reply rates vs vanity dashboards.', 'Sales Operations', ARRAY['sales productivity software','sales productivity tools','outbound productivity'], 20),
  ('outreach alternative', 'When to leave Outreach.io and what to replace it with for small sales teams. Real cost breakdown, feature parity, and migration steps.', 'Tool Comparisons', ARRAY['outreach alternative','outreach.io alternative','sales engagement platform'], 25),
  ('salesloft alternative', 'Salesloft alternatives for teams under 10 reps. Why the enterprise pricing makes no sense at your stage and what to use instead.', 'Tool Comparisons', ARRAY['salesloft alternative','sales engagement','SDR tooling'], 30),
  ('instantly alternative', 'Instantly alternatives that include real prospect data and personalization, not just inbox warming. For teams who outgrew spray-and-pray.', 'Tool Comparisons', ARRAY['instantly alternative','cold email tool','email warmup'], 35),
  ('AI sales assistant', 'What an AI sales assistant actually does today — separating real workflow help from vaporware. What to test before you buy.', 'AI for Sales', ARRAY['AI sales assistant','AI for sales','AI SDR','sales AI'], 40),
  ('best cold email software', 'Best cold email software for founders in 2026. Side-by-side comparison of deliverability, personalization, and pricing for low-volume senders.', 'Cold Email', ARRAY['cold email software','best cold email tool','outbound email'], 45),
  ('how to build an ICP', 'How to build an ICP in plain English without a 40-row spreadsheet. A practical 20-minute exercise for founders.', 'Sales Strategy', ARRAY['build ICP','ideal customer profile','ICP framework','target customer'], 50),
  ('lead scoring for B2B SaaS', 'Lead scoring for B2B SaaS without a marketing ops team. The signals that actually predict reply rate.', 'Sales Strategy', ARRAY['lead scoring','B2B lead scoring','prospect scoring','SaaS sales'], 55),
  ('email deliverability for cold outreach', 'Email deliverability for cold outreach in 2026: SPF, DKIM, DMARC, warmup, and the volume math that keeps you out of spam.', 'Cold Email', ARRAY['email deliverability','cold email deliverability','SPF DKIM DMARC','inbox placement'], 60),
  ('sales sequence templates', 'Sales sequence templates that don''t read like templates. 4-touch and 7-touch frameworks with real examples.', 'Cold Email', ARRAY['sales sequence templates','outbound sequence','cold email sequence','cadence templates'], 65);
