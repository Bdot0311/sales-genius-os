CREATE TABLE public.seo_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('perf', 'crawl', 'manual')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','partial','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  pages_checked int DEFAULT 0,
  issues_found int DEFAULT 0,
  new_issues int DEFAULT 0,
  resolved_issues int DEFAULT 0,
  summary jsonb DEFAULT '{}'::jsonb,
  error text
);

CREATE INDEX idx_seo_audit_runs_started ON public.seo_audit_runs (started_at DESC);

GRANT SELECT ON public.seo_audit_runs TO authenticated;
GRANT ALL ON public.seo_audit_runs TO service_role;

ALTER TABLE public.seo_audit_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read audit runs"
ON public.seo_audit_runs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.seo_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  category text NOT NULL CHECK (category IN ('crawl_error','schema','performance','accessibility','seo','sitemap')),
  severity text NOT NULL DEFAULT 'mid' CHECK (severity IN ('low','mid','high','critical')),
  url text,
  title text NOT NULL,
  description text,
  details jsonb DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_run_id uuid REFERENCES public.seo_audit_runs(id) ON DELETE SET NULL,
  notified_at timestamptz,
  resolved_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid
);

CREATE INDEX idx_seo_issues_open ON public.seo_issues (resolved_at, last_seen_at DESC);
CREATE INDEX idx_seo_issues_category ON public.seo_issues (category, severity);

GRANT SELECT, UPDATE ON public.seo_issues TO authenticated;
GRANT ALL ON public.seo_issues TO service_role;

ALTER TABLE public.seo_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read seo issues"
ON public.seo_issues FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update seo issues"
ON public.seo_issues FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_get_seo_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  SELECT jsonb_build_object(
    'open_issues', (
      SELECT COALESCE(jsonb_agg(row_to_json(i)), '[]'::jsonb)
      FROM (
        SELECT id, fingerprint, category, severity, url, title, description, details,
               first_seen_at, last_seen_at, notified_at, acknowledged_at
        FROM public.seo_issues
        WHERE resolved_at IS NULL
        ORDER BY 
          CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'mid' THEN 2 ELSE 1 END DESC,
          last_seen_at DESC
        LIMIT 200
      ) i
    ),
    'recent_runs', (
      SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb)
      FROM (
        SELECT id, kind, status, started_at, finished_at, pages_checked, issues_found,
               new_issues, resolved_issues, summary, error
        FROM public.seo_audit_runs
        ORDER BY started_at DESC
        LIMIT 30
      ) r
    ),
    'counts', (
      SELECT jsonb_build_object(
        'open_total', COUNT(*) FILTER (WHERE resolved_at IS NULL),
        'open_critical', COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'critical'),
        'open_high', COUNT(*) FILTER (WHERE resolved_at IS NULL AND severity = 'high'),
        'unacknowledged', COUNT(*) FILTER (WHERE resolved_at IS NULL AND acknowledged_at IS NULL)
      ) FROM public.seo_issues
    )
  ) INTO _result;

  RETURN _result;
END;
$$;