-- Real usage tracking for signed-in users: live presence + page activity.

CREATE TABLE IF NOT EXISTS public.user_activity_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  page_views integer NOT NULL DEFAULT 1,
  path text,
  user_agent text,
  is_mobile boolean NOT NULL DEFAULT false,
  CONSTRAINT user_activity_sessions_session_unique UNIQUE (user_id, session_id)
);

GRANT SELECT, INSERT, UPDATE ON public.user_activity_sessions TO authenticated;
GRANT ALL ON public.user_activity_sessions TO service_role;

ALTER TABLE public.user_activity_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sessions insert" ON public.user_activity_sessions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sessions update" ON public.user_activity_sessions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own or admin sessions select" ON public.user_activity_sessions
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS user_activity_sessions_user_seen_idx
  ON public.user_activity_sessions (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS user_activity_sessions_seen_idx
  ON public.user_activity_sessions (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.user_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  path text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer
);

GRANT SELECT, INSERT ON public.user_page_views TO authenticated;
GRANT ALL ON public.user_page_views TO service_role;

ALTER TABLE public.user_page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own page views insert" ON public.user_page_views
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id
    AND length(path) BETWEEN 1 AND 300
    AND (duration_seconds IS NULL OR (duration_seconds >= 0 AND duration_seconds <= 86400))
  );
CREATE POLICY "own or admin page views select" ON public.user_page_views
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS user_page_views_user_time_idx
  ON public.user_page_views (user_id, viewed_at DESC);

-- Live usage snapshot for the admin panel.
CREATE OR REPLACE FUNCTION public.admin_get_live_usage()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'online', COALESCE((
      SELECT jsonb_agg(o ORDER BY o->>'last_seen_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'user_id', s.user_id,
          'email', p.email,
          'full_name', p.full_name,
          'path', s.path,
          'last_seen_at', s.last_seen_at,
          'started_at', s.started_at,
          'page_views', s.page_views,
          'is_mobile', s.is_mobile
        ) AS o
        FROM public.user_activity_sessions s
        LEFT JOIN public.profiles p ON p.id = s.user_id
        WHERE s.last_seen_at > now() - interval '2 minutes'
      ) q
    ), '[]'::jsonb),
    'active_today', (SELECT count(DISTINCT user_id) FROM public.user_activity_sessions WHERE last_seen_at > now() - interval '24 hours'),
    'active_7d', (SELECT count(DISTINCT user_id) FROM public.user_activity_sessions WHERE last_seen_at > now() - interval '7 days'),
    'active_30d', (SELECT count(DISTINCT user_id) FROM public.user_activity_sessions WHERE last_seen_at > now() - interval '30 days')
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_live_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_live_usage() TO authenticated, service_role;

-- Per-user activity rollup, joined into the admin user list.
CREATE OR REPLACE FUNCTION public.admin_list_user_activity_summary()
RETURNS TABLE (
  user_id uuid,
  last_active_at timestamptz,
  minutes_7d integer,
  sessions_30d integer,
  page_views_30d integer,
  top_paths text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH sess AS (
    SELECT s.user_id,
           max(s.last_seen_at) AS last_active_at,
           count(*) FILTER (WHERE s.last_seen_at > now() - interval '30 days') AS sessions_30d,
           COALESCE(sum(
             CASE WHEN s.last_seen_at > now() - interval '7 days'
               THEN GREATEST(0, EXTRACT(EPOCH FROM (s.last_seen_at - s.started_at)) / 60)
               ELSE 0 END
           ), 0) AS minutes_7d
    FROM public.user_activity_sessions s
    GROUP BY s.user_id
  ),
  views AS (
    SELECT v.user_id,
           count(*) AS page_views_30d
    FROM public.user_page_views v
    WHERE v.viewed_at > now() - interval '30 days'
    GROUP BY v.user_id
  ),
  paths AS (
    SELECT t.user_id, array_agg(t.path ORDER BY t.n DESC) AS top_paths
    FROM (
      SELECT v.user_id, v.path, count(*) AS n,
             row_number() OVER (PARTITION BY v.user_id ORDER BY count(*) DESC) AS rn
      FROM public.user_page_views v
      WHERE v.viewed_at > now() - interval '30 days'
      GROUP BY v.user_id, v.path
    ) t
    WHERE t.rn <= 4
    GROUP BY t.user_id
  )
  SELECT sess.user_id,
         sess.last_active_at,
         ROUND(sess.minutes_7d)::integer,
         sess.sessions_30d::integer,
         COALESCE(views.page_views_30d, 0)::integer,
         COALESCE(paths.top_paths, ARRAY[]::text[])
  FROM sess
  LEFT JOIN views ON views.user_id = sess.user_id
  LEFT JOIN paths ON paths.user_id = sess.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_activity_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_activity_summary() TO authenticated, service_role;

-- One person's recent visits.
CREATE OR REPLACE FUNCTION public.admin_get_user_activity(_user_id uuid)
RETURNS TABLE (
  viewed_at timestamptz,
  path text,
  duration_seconds integer,
  session_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT v.viewed_at, v.path, v.duration_seconds, v.session_id
  FROM public.user_page_views v
  WHERE v.user_id = _user_id
  ORDER BY v.viewed_at DESC
  LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_user_activity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_user_activity(uuid) TO authenticated, service_role;

-- Retention sweep.
CREATE OR REPLACE FUNCTION public.cleanup_user_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_page_views WHERE viewed_at < now() - interval '90 days';
  DELETE FROM public.user_activity_sessions WHERE last_seen_at < now() - interval '180 days';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_user_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_user_activity() TO service_role, postgres;

-- Live presence for the admin panel.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_activity_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT 'user_activity_sessions', c, 'live usage tracking for signed-in users'
FROM unnest(ARRAY['id','user_id','session_id','started_at','last_seen_at','page_views','path','user_agent','is_mobile']) AS c
ON CONFLICT DO NOTHING;

INSERT INTO public.schema_contract (table_name, column_name, note)
SELECT 'user_page_views', c, 'per-page activity for real usage reporting'
FROM unnest(ARRAY['id','user_id','session_id','path','viewed_at','duration_seconds']) AS c
ON CONFLICT DO NOTHING;
