CREATE TABLE IF NOT EXISTS public.site_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  visitor_id text NOT NULL,
  session_id text NOT NULL,
  posthog_distinct_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  landing_path text,
  landing_url text,
  first_touch_source text,
  first_touch_medium text,
  first_touch_campaign text,
  traffic_channel text,
  is_first_visit boolean NOT NULL DEFAULT false,
  user_agent text,
  language text,
  screen_width integer,
  timezone text
);

GRANT INSERT ON public.site_visits TO anon;
GRANT INSERT, SELECT ON public.site_visits TO authenticated;
GRANT ALL ON public.site_visits TO service_role;

ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can log a visit" ON public.site_visits;
CREATE POLICY "Anyone can log a visit"
  ON public.site_visits FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read the visit log" ON public.site_visits;
CREATE POLICY "Admins can read the visit log"
  ON public.site_visits FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS site_visits_session_unique
  ON public.site_visits (session_id);
CREATE INDEX IF NOT EXISTS site_visits_created_at_idx
  ON public.site_visits (created_at DESC);
CREATE INDEX IF NOT EXISTS site_visits_source_idx
  ON public.site_visits (utm_source, utm_medium);

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES
  ('site_visits', 'utm_source', 'Traffic attribution: required by the admin Traffic Sources report'),
  ('site_visits', 'first_touch_source', 'Traffic attribution: first-touch source for the visitor log'),
  ('site_visits', 'session_id', 'Traffic attribution: dedupes one visit row per browser session')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_traffic_sources(p_days integer DEFAULT 30)
RETURNS TABLE (
  utm_source text,
  utm_medium text,
  utm_campaign text,
  visits bigint,
  first_visits bigint,
  last_seen timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(v.utm_source, 'unknown'),
    COALESCE(v.utm_medium, 'unknown'),
    COALESCE(v.utm_campaign, ''),
    count(*)::bigint,
    count(*) FILTER (WHERE v.is_first_visit)::bigint,
    max(v.created_at)
  FROM public.site_visits v
  WHERE v.created_at > now() - make_interval(days => GREATEST(COALESCE(p_days, 30), 1))
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC
$$;

GRANT EXECUTE ON FUNCTION public.admin_traffic_sources(integer) TO authenticated;