-- Visitor Intelligence (company-level, off until an admin grants the workspace).
--
-- Raw IP addresses are stored only on visitor_resolve_jobs, for at most 24 hours,
-- and cleared when the job finishes or the retention function runs. Events, matches
-- and the customer UI do not store the address. IP hashes use a server pepper so
-- they are not reversible from the public IPv4 space. Network cache stores the
-- public registry answer for a /24 or /48, which is not a visitor identity.
--
-- Person-level identity is a nullable person_id on the match. It is unused.
-- Adding a person later does not require a new event table.
--
-- No third-party reveal vendor. Unknown stays Unknown.

CREATE TABLE IF NOT EXISTS public.visitor_workspace_grants (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  enabled_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.visitor_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Website',
  allowed_domains text[] NOT NULL DEFAULT '{}',
  verified_hosts text[] NOT NULL DEFAULT '{}',
  consent_mode text NOT NULL DEFAULT 'required' CHECK (consent_mode IN ('required', 'not_required')),
  excluded_paths text[] NOT NULL DEFAULT '{}',
  excluded_ips text[] NOT NULL DEFAULT '{}',
  retention_days integer NOT NULL DEFAULT 90 CHECK (retention_days BETWEEN 7 AND 365),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitor_sites_user ON public.visitor_sites (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.visitor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.visitor_sites (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_id text NOT NULL,
  event_name text NOT NULL,
  path text NOT NULL DEFAULT '/',
  page_type text NOT NULL DEFAULT 'other',
  referrer_host text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id text NOT NULL,
  visitor_key text NOT NULL,
  is_returning boolean NOT NULL DEFAULT false,
  engagement jsonb,
  is_test boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_events_site_event
  ON public.visitor_events (site_id, event_id);
CREATE INDEX IF NOT EXISTS idx_visitor_events_site_time
  ON public.visitor_events (site_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitor_events_visitor
  ON public.visitor_events (site_id, visitor_key, received_at DESC);

CREATE TABLE IF NOT EXISTS public.visitor_company_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.visitor_sites (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  visitor_key text NOT NULL,
  company_id uuid,
  person_id uuid,
  lead_id uuid,
  status text NOT NULL CHECK (status IN ('matched', 'unknown')),
  classification text NOT NULL DEFAULT 'unknown',
  company_name text,
  company_domain text,
  confidence numeric(3, 2),
  unknown_reason text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  network_prefix text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT visitor_matches_confidence_when_known CHECK (
    (status = 'matched' AND confidence IS NOT NULL AND company_name IS NOT NULL AND company_domain IS NOT NULL)
    OR (status = 'unknown' AND confidence IS NULL AND company_name IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_matches_visitor
  ON public.visitor_company_matches (site_id, visitor_key);
CREATE INDEX IF NOT EXISTS idx_visitor_matches_user
  ON public.visitor_company_matches (user_id, last_seen DESC);

CREATE TABLE IF NOT EXISTS public.visitor_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.visitor_sites (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  page_types text[] NOT NULL DEFAULT '{}',
  event_names text[] NOT NULL DEFAULT '{page_view}',
  min_confidence numeric(3, 2) NOT NULL DEFAULT 0.70,
  actions text[] NOT NULL DEFAULT '{find_contacts,enrich,draft}',
  sequence_id uuid,
  daily_cap integer NOT NULL DEFAULT 5 CHECK (daily_cap BETWEEN 1 AND 25),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitor_rules_site ON public.visitor_rules (site_id, enabled);

CREATE TABLE IF NOT EXISTS public.visitor_rule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.visitor_rules (id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES public.visitor_company_matches (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  skip_reason text,
  actions_taken jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_rule_runs_once
  ON public.visitor_rule_runs (rule_id, match_id);
CREATE INDEX IF NOT EXISTS idx_visitor_rule_runs_day
  ON public.visitor_rule_runs (user_id, created_at DESC);

-- Service-only. Holds the address until resolution, then clears it.
CREATE TABLE IF NOT EXISTS public.visitor_resolve_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.visitor_sites (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  visitor_key text NOT NULL,
  ip_hash text NOT NULL,
  ip_raw text,
  ip_raw_until timestamptz,
  network_prefix text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  available_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_jobs_hash
  ON public.visitor_resolve_jobs (site_id, ip_hash);
CREATE INDEX IF NOT EXISTS idx_visitor_jobs_claim
  ON public.visitor_resolve_jobs (status, available_at);

CREATE TABLE IF NOT EXISTS public.visitor_network_cache (
  network_prefix text PRIMARY KEY,
  classification text NOT NULL,
  unknown_reason text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.visitor_ip_cache (
  ip_hash text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('matched', 'unknown')),
  classification text NOT NULL,
  company_name text,
  company_domain text,
  confidence numeric(3, 2),
  unknown_reason text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  network_prefix text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE OR REPLACE FUNCTION public.visitor_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS visitor_sites_touch ON public.visitor_sites;
CREATE TRIGGER visitor_sites_touch BEFORE UPDATE ON public.visitor_sites
  FOR EACH ROW EXECUTE FUNCTION public.visitor_touch_updated_at();

DROP TRIGGER IF EXISTS visitor_rules_touch ON public.visitor_rules;
CREATE TRIGGER visitor_rules_touch BEFORE UPDATE ON public.visitor_rules
  FOR EACH ROW EXECUTE FUNCTION public.visitor_touch_updated_at();

DROP TRIGGER IF EXISTS visitor_grants_touch ON public.visitor_workspace_grants;
CREATE TRIGGER visitor_grants_touch BEFORE UPDATE ON public.visitor_workspace_grants
  FOR EACH ROW EXECUTE FUNCTION public.visitor_touch_updated_at();

-- Workspace owner: the team owner when this user is an active member, else themselves.
CREATE OR REPLACE FUNCTION public.visitor_workspace_owner()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  IF to_regclass('public.team_members') IS NOT NULL THEN
    EXECUTE
      'SELECT team_owner_id FROM public.team_members WHERE member_user_id = $1 AND status = ''active'' ORDER BY created_at LIMIT 1'
      INTO owner
      USING auth.uid();
    IF owner IS NOT NULL THEN
      RETURN owner;
    END IF;
  END IF;
  RETURN auth.uid();
END;
$$;

-- Both the global kill switch and an admin grant are required. Either one off means off.
CREATE OR REPLACE FUNCTION public.visitor_intelligence_enabled()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner uuid;
  flag boolean := false;
BEGIN
  owner := public.visitor_workspace_owner();
  IF owner IS NULL THEN
    RETURN false;
  END IF;
  IF to_regclass('public.feature_flags') IS NULL THEN
    RETURN false;
  END IF;
  SELECT coalesce(is_enabled, false) INTO flag
    FROM public.feature_flags
   WHERE name = 'visitorIntelligence';
  IF coalesce(flag, false) IS NOT TRUE THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.visitor_workspace_grants g
    WHERE g.user_id = owner AND g.enabled IS TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.visitor_workspace_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.visitor_intelligence_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitor_workspace_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.visitor_intelligence_enabled() TO authenticated;

ALTER TABLE public.visitor_workspace_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_company_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_rule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_resolve_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_network_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_ip_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visitor_grants_select ON public.visitor_workspace_grants;
CREATE POLICY visitor_grants_select ON public.visitor_workspace_grants
  FOR SELECT TO authenticated
  USING (user_id = public.visitor_workspace_owner());

DROP POLICY IF EXISTS visitor_grants_admin ON public.visitor_workspace_grants;
CREATE POLICY visitor_grants_admin ON public.visitor_workspace_grants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS visitor_sites_rw ON public.visitor_sites;
CREATE POLICY visitor_sites_rw ON public.visitor_sites
  FOR ALL TO authenticated
  USING (user_id = public.visitor_workspace_owner() AND public.visitor_intelligence_enabled())
  WITH CHECK (user_id = public.visitor_workspace_owner() AND public.visitor_intelligence_enabled());

DROP POLICY IF EXISTS visitor_events_select ON public.visitor_events;
CREATE POLICY visitor_events_select ON public.visitor_events
  FOR SELECT TO authenticated
  USING (user_id = public.visitor_workspace_owner() AND public.visitor_intelligence_enabled());

DROP POLICY IF EXISTS visitor_matches_select ON public.visitor_company_matches;
CREATE POLICY visitor_matches_select ON public.visitor_company_matches
  FOR SELECT TO authenticated
  USING (user_id = public.visitor_workspace_owner() AND public.visitor_intelligence_enabled());

DROP POLICY IF EXISTS visitor_rules_rw ON public.visitor_rules;
CREATE POLICY visitor_rules_rw ON public.visitor_rules
  FOR ALL TO authenticated
  USING (user_id = public.visitor_workspace_owner() AND public.visitor_intelligence_enabled())
  WITH CHECK (user_id = public.visitor_workspace_owner() AND public.visitor_intelligence_enabled());

DROP POLICY IF EXISTS visitor_runs_select ON public.visitor_rule_runs;
CREATE POLICY visitor_runs_select ON public.visitor_rule_runs
  FOR SELECT TO authenticated
  USING (user_id = public.visitor_workspace_owner() AND public.visitor_intelligence_enabled());

-- Jobs and caches are service-role only. No authenticated policy.

REVOKE ALL ON public.visitor_workspace_grants FROM PUBLIC, anon;
REVOKE ALL ON public.visitor_sites FROM PUBLIC, anon;
REVOKE ALL ON public.visitor_events FROM PUBLIC, anon;
REVOKE ALL ON public.visitor_company_matches FROM PUBLIC, anon;
REVOKE ALL ON public.visitor_rules FROM PUBLIC, anon;
REVOKE ALL ON public.visitor_rule_runs FROM PUBLIC, anon;
REVOKE ALL ON public.visitor_resolve_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.visitor_network_cache FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.visitor_ip_cache FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.visitor_workspace_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_sites TO authenticated;
GRANT SELECT ON public.visitor_events TO authenticated;
GRANT SELECT ON public.visitor_company_matches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_rules TO authenticated;
GRANT SELECT ON public.visitor_rule_runs TO authenticated;

GRANT ALL ON public.visitor_workspace_grants TO service_role;
GRANT ALL ON public.visitor_sites TO service_role;
GRANT ALL ON public.visitor_events TO service_role;
GRANT ALL ON public.visitor_company_matches TO service_role;
GRANT ALL ON public.visitor_rules TO service_role;
GRANT ALL ON public.visitor_rule_runs TO service_role;
GRANT ALL ON public.visitor_resolve_jobs TO service_role;
GRANT ALL ON public.visitor_network_cache TO service_role;
GRANT ALL ON public.visitor_ip_cache TO service_role;

-- Admin writes to grants need INSERT/UPDATE, which SELECT-only would block.
GRANT INSERT, UPDATE, DELETE ON public.visitor_workspace_grants TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_visitor_resolve_jobs(p_limit integer)
RETURNS SETOF public.visitor_resolve_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.visitor_resolve_jobs j
     SET status = 'running',
         attempts = j.attempts + 1,
         claimed_at = now()
   WHERE j.id IN (
     SELECT id FROM public.visitor_resolve_jobs
      WHERE status = 'queued' AND available_at <= now()
      ORDER BY available_at
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20))
   )
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_visitor_resolve_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_visitor_resolve_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.visitor_apply_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.visitor_resolve_jobs
     SET ip_raw = NULL
   WHERE ip_raw IS NOT NULL
     AND ip_raw_until IS NOT NULL
     AND ip_raw_until < now();

  DELETE FROM public.visitor_events e
    USING public.visitor_sites s
   WHERE e.site_id = s.id
     AND e.received_at < now() - make_interval(days => s.retention_days);

  DELETE FROM public.visitor_network_cache WHERE expires_at < now();
  DELETE FROM public.visitor_ip_cache WHERE expires_at < now();
END;
$$;

REVOKE ALL ON FUNCTION public.visitor_apply_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.visitor_apply_retention() TO service_role;

DO $$
BEGIN
  IF to_regclass('public.feature_flags') IS NOT NULL THEN
    INSERT INTO public.feature_flags (name, description, is_enabled, target_plans)
    VALUES (
      'visitorIntelligence',
      'Company-level website visitor identification. Off unless also granted per workspace.',
      false,
      ARRAY['growth', 'pro']
    )
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

-- Cron calls the resolver. Missing pg_cron or vault skips scheduling; the function remains callable.
CREATE OR REPLACE FUNCTION public.trigger_visitor_resolve()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config_url text;
  config_key text;
BEGIN
  PERFORM public.visitor_apply_retention();
  IF to_regclass('public.admin_settings') IS NULL THEN
    RETURN;
  END IF;
  SELECT setting_value->>'supabase_url' INTO config_url
    FROM public.admin_settings
   WHERE setting_key = 'supabase_config';
  config_key := public.internal_job_key();
  IF config_url IS NULL OR config_key IS NULL THEN
    RAISE WARNING 'trigger_visitor_resolve: edge credentials missing; skipped';
    RETURN;
  END IF;
  PERFORM net.http_post(
    url := config_url || '/functions/v1/visitor-resolve',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || config_key
    ),
    body := '{"scheduled": true}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_visitor_resolve() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('visitor-resolve');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'visitor-resolve',
    '3-59/2 * * * *',
    $cmd$ SELECT public.trigger_visitor_resolve(); $cmd$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'visitor-resolve not scheduled: %', SQLERRM;
END $$;
