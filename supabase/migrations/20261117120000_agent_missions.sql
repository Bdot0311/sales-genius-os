-- Always-on agent missions.
--
-- A mission is a goal the user sets once. pg_cron claims a due mission into
-- one run per local day, then enqueues that run on the existing agent job
-- queue. process-agent-jobs does the work. process-scheduled-emails remains
-- the only sender.
--
-- Off until both the agentMissions flag and a per-workspace grant are on.
-- Same shape as Visitor Intelligence.

CREATE TABLE IF NOT EXISTS public.agent_mission_grants (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  enabled_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_config_id uuid NOT NULL,
  icp_profile_id uuid,
  sequence_id uuid,
  name text NOT NULL,
  goal text NOT NULL,
  mode text NOT NULL DEFAULT 'approval' CHECK (mode IN ('autopilot', 'approval')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'stopped')),
  pause_reason text,
  timezone text NOT NULL DEFAULT 'UTC',
  days_of_week smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  run_hour smallint NOT NULL DEFAULT 7 CHECK (run_hour BETWEEN 0 AND 23),
  run_minute smallint NOT NULL DEFAULT 0 CHECK (run_minute BETWEEN 0 AND 59),
  send_window_start text NOT NULL DEFAULT '08:00',
  send_window_end text NOT NULL DEFAULT '17:00',
  daily_lead_cap integer NOT NULL DEFAULT 10 CHECK (daily_lead_cap BETWEEN 1 AND 500),
  daily_send_cap integer NOT NULL DEFAULT 10 CHECK (daily_send_cap BETWEEN 1 AND 500),
  daily_spend_cap_usd numeric(8, 2) NOT NULL DEFAULT 5 CHECK (daily_spend_cap_usd BETWEEN 1 AND 25),
  bounce_pause_rate numeric(6, 4) NOT NULL DEFAULT 0.0500,
  negative_reply_pause_rate numeric(6, 4) NOT NULL DEFAULT 0.1500,
  stop_on date,
  max_runs integer,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_agent_missions_due
  ON public.agent_missions (next_run_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.agent_mission_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  user_id uuid NOT NULL,
  window_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped', 'paused')),
  job_id uuid,
  phase text NOT NULL DEFAULT 'search',
  cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  skip_reason text,
  leads_found integer NOT NULL DEFAULT 0,
  drafts_written integer NOT NULL DEFAULT 0,
  sends_queued integer NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, window_key),
  UNIQUE (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_agent_mission_runs_user
  ON public.agent_mission_runs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_mission_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  run_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('in_app', 'email')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, channel)
);

CREATE OR REPLACE FUNCTION public.agent_mission_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_mission_grants_touch ON public.agent_mission_grants;
CREATE TRIGGER agent_mission_grants_touch BEFORE UPDATE ON public.agent_mission_grants
  FOR EACH ROW EXECUTE FUNCTION public.agent_mission_touch();

DROP TRIGGER IF EXISTS agent_missions_touch ON public.agent_missions;
CREATE TRIGGER agent_missions_touch BEFORE UPDATE ON public.agent_missions
  FOR EACH ROW EXECUTE FUNCTION public.agent_mission_touch();

-- Workspace owner: team owner when this user is an active member, else themselves.
CREATE OR REPLACE FUNCTION public.agent_mission_workspace_owner()
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

CREATE OR REPLACE FUNCTION public.agent_missions_enabled()
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
  owner := public.agent_mission_workspace_owner();
  IF owner IS NULL THEN
    RETURN false;
  END IF;
  IF to_regclass('public.feature_flags') IS NULL THEN
    RETURN false;
  END IF;
  SELECT coalesce(is_enabled, false) INTO flag
    FROM public.feature_flags
   WHERE name = 'agentMissions';
  IF coalesce(flag, false) IS NOT TRUE THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.agent_mission_grants g
    WHERE g.user_id = owner AND g.enabled IS TRUE
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agent_mission_workspace_owner() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_missions_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_mission_workspace_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_missions_enabled() TO authenticated;

-- Stamp the workspace owner on user writes. Service role (no JWT) keeps the id it passed.
CREATE OR REPLACE FUNCTION public.agent_mission_stamp_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.user_id := public.agent_mission_workspace_owner();
  END IF;
  IF NEW.next_run_at IS NULL THEN
    NEW.next_run_at := public.agent_mission_next_run(
      now(), NEW.timezone, NEW.days_of_week, NEW.run_hour, NEW.run_minute
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Local wall time of the next allowed day, strictly after p_from.
CREATE OR REPLACE FUNCTION public.agent_mission_next_run(
  p_from timestamptz,
  p_timezone text,
  p_days smallint[],
  p_hour integer,
  p_minute integer
) RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  zone text := COALESCE(NULLIF(btrim(p_timezone), ''), 'UTC');
  days smallint[] := p_days;
  local_midnight timestamp;
  i integer;
  candidate timestamptz;
  dow integer;
BEGIN
  IF days IS NULL OR cardinality(days) = 0 THEN
    days := ARRAY[1, 2, 3, 4, 5]::smallint[];
  END IF;
  BEGIN
    local_midnight := date_trunc('day', p_from AT TIME ZONE zone);
  EXCEPTION WHEN OTHERS THEN
    zone := 'UTC';
    local_midnight := date_trunc('day', p_from AT TIME ZONE 'UTC');
  END;
  FOR i IN 0..20 LOOP
    BEGIN
      candidate := (local_midnight + make_interval(days => i, hours => GREATEST(0, LEAST(COALESCE(p_hour, 7), 23)), mins => GREATEST(0, LEAST(COALESCE(p_minute, 0), 59)))) AT TIME ZONE zone;
    EXCEPTION WHEN OTHERS THEN
      candidate := (local_midnight + make_interval(days => i, hours => 7)) AT TIME ZONE 'UTC';
    END;
    dow := EXTRACT(DOW FROM candidate AT TIME ZONE zone)::integer;
    IF dow = ANY(days) AND candidate > p_from THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RETURN p_from + interval '1 day';
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_mission_window_key(p_at timestamptz, p_timezone text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  zone text := COALESCE(NULLIF(btrim(p_timezone), ''), 'UTC');
BEGIN
  BEGIN
    RETURN to_char(p_at AT TIME ZONE zone, 'YYYY-MM-DD');
  EXCEPTION WHEN OTHERS THEN
    RETURN to_char(p_at AT TIME ZONE 'UTC', 'YYYY-MM-DD');
  END;
END;
$$;

DROP TRIGGER IF EXISTS agent_missions_stamp ON public.agent_missions;
CREATE TRIGGER agent_missions_stamp BEFORE INSERT ON public.agent_missions
  FOR EACH ROW EXECUTE FUNCTION public.agent_mission_stamp_owner();

-- Composite tenant keys. A mission cannot point at another workspace's agent, ICP or sequence.
DO $$
BEGIN
  IF to_regclass('public.agent_configs') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_configs_user_id ON public.agent_configs (user_id, id);
    ALTER TABLE public.agent_missions DROP CONSTRAINT IF EXISTS agent_missions_agent_fkey;
    ALTER TABLE public.agent_missions
      ADD CONSTRAINT agent_missions_agent_fkey
      FOREIGN KEY (user_id, agent_config_id)
      REFERENCES public.agent_configs (user_id, id)
      ON DELETE CASCADE;
  END IF;
  IF to_regclass('public.icp_profiles') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_icp_profiles_user_id ON public.icp_profiles (user_id, id);
    ALTER TABLE public.agent_missions DROP CONSTRAINT IF EXISTS agent_missions_icp_fkey;
    ALTER TABLE public.agent_missions
      ADD CONSTRAINT agent_missions_icp_fkey
      FOREIGN KEY (user_id, icp_profile_id)
      REFERENCES public.icp_profiles (user_id, id)
      ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.email_sequences') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_email_sequences_user_id ON public.email_sequences (user_id, id);
    ALTER TABLE public.agent_missions DROP CONSTRAINT IF EXISTS agent_missions_sequence_fkey;
    ALTER TABLE public.agent_missions
      ADD CONSTRAINT agent_missions_sequence_fkey
      FOREIGN KEY (user_id, sequence_id)
      REFERENCES public.email_sequences (user_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.agent_mission_runs DROP CONSTRAINT IF EXISTS agent_mission_runs_mission_fkey;
ALTER TABLE public.agent_mission_runs
  ADD CONSTRAINT agent_mission_runs_mission_fkey
  FOREIGN KEY (user_id, mission_id)
  REFERENCES public.agent_missions (user_id, id)
  ON DELETE CASCADE;

ALTER TABLE public.agent_mission_digests DROP CONSTRAINT IF EXISTS agent_mission_digests_mission_fkey;
ALTER TABLE public.agent_mission_digests
  ADD CONSTRAINT agent_mission_digests_mission_fkey
  FOREIGN KEY (user_id, mission_id)
  REFERENCES public.agent_missions (user_id, id)
  ON DELETE CASCADE;

ALTER TABLE public.agent_mission_digests DROP CONSTRAINT IF EXISTS agent_mission_digests_run_fkey;
ALTER TABLE public.agent_mission_digests
  ADD CONSTRAINT agent_mission_digests_run_fkey
  FOREIGN KEY (user_id, run_id)
  REFERENCES public.agent_mission_runs (user_id, id)
  ON DELETE CASCADE;

-- The queue already rejects unknown kinds. Mission is one more kind, not a second queue.
DO $$
BEGIN
  IF to_regclass('public.agent_jobs') IS NOT NULL THEN
    ALTER TABLE public.agent_jobs DROP CONSTRAINT IF EXISTS agent_jobs_kind_check;
    ALTER TABLE public.agent_jobs
      ADD CONSTRAINT agent_jobs_kind_check
      CHECK (kind IN ('draft', 'enrich', 'score', 'research', 'search', 'mission'));
  END IF;
END $$;

/*
 * Claim today's run for one mission.
 *
 * Advisory lock on the mission, then one row per window. A second caller
 * waits, sees the row, and gets NULL. Cron (no JWT) and service_role may
 * call it. anon and authenticated may not, even if a grant is added later.
 */
CREATE OR REPLACE FUNCTION public.claim_agent_mission_run(p_mission_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := '';
  v_mission public.agent_missions%ROWTYPE;
  v_flag boolean := false;
  v_window text;
  v_existing uuid;
  v_completed integer;
  v_run uuid;
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'claim_agent_mission_run is internal';
    END IF;
  END IF;
  IF p_mission_id IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('agent-mission:' || p_mission_id::text, 0));

  SELECT * INTO v_mission FROM public.agent_missions WHERE id = p_mission_id FOR UPDATE;
  IF NOT FOUND OR v_mission.status <> 'active' THEN
    RETURN NULL;
  END IF;
  IF v_mission.next_run_at IS NULL OR v_mission.next_run_at > now() THEN
    RETURN NULL;
  END IF;

  IF to_regclass('public.feature_flags') IS NOT NULL THEN
    SELECT coalesce(is_enabled, false) INTO v_flag
      FROM public.feature_flags WHERE name = 'agentMissions';
  END IF;
  IF coalesce(v_flag, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agent_mission_grants g
    WHERE g.user_id = v_mission.user_id AND g.enabled IS TRUE
  ) THEN
    RETURN NULL;
  END IF;

  IF v_mission.stop_on IS NOT NULL
     AND (now() AT TIME ZONE COALESCE(NULLIF(btrim(v_mission.timezone), ''), 'UTC'))::date > v_mission.stop_on THEN
    UPDATE public.agent_missions
       SET status = 'stopped', pause_reason = 'Stop date reached.'
     WHERE id = v_mission.id;
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_completed
    FROM public.agent_mission_runs
   WHERE mission_id = v_mission.id AND status = 'completed';
  IF v_mission.max_runs IS NOT NULL AND v_completed >= v_mission.max_runs THEN
    UPDATE public.agent_missions
       SET status = 'stopped', pause_reason = 'Run limit reached.'
     WHERE id = v_mission.id;
    RETURN NULL;
  END IF;

  v_window := public.agent_mission_window_key(v_mission.next_run_at, v_mission.timezone);
  SELECT id INTO v_existing
    FROM public.agent_mission_runs
   WHERE mission_id = v_mission.id AND window_key = v_window;
  IF v_existing IS NOT NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.agent_mission_runs (mission_id, user_id, window_key, status, claimed_at)
  VALUES (v_mission.id, v_mission.user_id, v_window, 'queued', now())
  RETURNING id INTO v_run;

  -- The next slot is after now, so a mission that was offline does not
  -- replay every missed day. This claim still covers the overdue window.
  UPDATE public.agent_missions
     SET next_run_at = public.agent_mission_next_run(
           now(),
           v_mission.timezone,
           v_mission.days_of_week,
           v_mission.run_hour,
           v_mission.run_minute
         ),
         last_run_at = now()
   WHERE id = v_mission.id;

  RETURN v_run;
EXCEPTION
  WHEN unique_violation THEN
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_mission_run(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_mission_run(uuid) TO service_role;

/*
 * One queue job for a claimed run.
 *
 * Held under the same mission lock. A crash after the claim leaves the run
 * queued with no item; the next tick creates the item instead of a second run.
 */
CREATE OR REPLACE FUNCTION public.agent_mission_ensure_job(p_run_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := '';
  v_run public.agent_mission_runs%ROWTYPE;
  v_mission public.agent_missions%ROWTYPE;
  v_open uuid;
  v_job uuid;
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'agent_mission_ensure_job is internal';
    END IF;
  END IF;
  IF to_regclass('public.agent_jobs') IS NULL OR to_regclass('public.agent_job_items') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_run FROM public.agent_mission_runs WHERE id = p_run_id;
  IF NOT FOUND OR v_run.status NOT IN ('queued', 'running') THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('agent-mission:' || v_run.mission_id::text, 0));

  SELECT * INTO v_mission FROM public.agent_missions WHERE id = v_run.mission_id AND user_id = v_run.user_id;
  IF NOT FOUND OR v_mission.status <> 'active' THEN
    RETURN NULL;
  END IF;

  IF v_run.job_id IS NOT NULL THEN
    SELECT i.id INTO v_open
      FROM public.agent_job_items i
      JOIN public.agent_jobs j ON j.id = i.job_id
     WHERE i.job_id = v_run.job_id
       AND i.status IN ('pending', 'claimed')
       AND j.status IN ('queued', 'running')
     LIMIT 1;
    IF v_open IS NOT NULL THEN
      RETURN v_run.job_id;
    END IF;
  END IF;

  INSERT INTO public.agent_jobs (
    user_id, agent_config_id, kind, request_text, autonomy, goal, status, total
  ) VALUES (
    v_mission.user_id,
    v_mission.agent_config_id,
    'mission',
    v_mission.goal,
    CASE WHEN v_mission.mode = 'autopilot' THEN 'autonomous' ELSE 'approval' END,
    'introduction',
    'queued',
    GREATEST(v_mission.daily_send_cap, 1)
  )
  RETURNING id INTO v_job;

  INSERT INTO public.agent_job_items (job_id, user_id, status, payload)
  VALUES (
    v_job,
    v_mission.user_id,
    'pending',
    jsonb_build_object('mission_id', v_mission.id, 'run_id', v_run.id)
  );

  UPDATE public.agent_mission_runs
     SET job_id = v_job, status = 'running'
   WHERE id = v_run.id AND user_id = v_mission.user_id;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_mission_ensure_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_mission_ensure_job(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_due_agent_missions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := '';
  v_mission record;
  v_run uuid;
  v_stranded uuid;
  v_count integer := 0;
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'enqueue_due_agent_missions is internal';
    END IF;
  END IF;

  FOR v_mission IN
    SELECT id
      FROM public.agent_missions
     WHERE status = 'active'
       AND next_run_at IS NOT NULL
       AND next_run_at <= now()
     ORDER BY next_run_at
     LIMIT 25
  LOOP
    v_run := public.claim_agent_mission_run(v_mission.id);
    IF v_run IS NOT NULL AND public.agent_mission_ensure_job(v_run) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  -- A claim that died before its queue row exists is picked up here, not claimed again.
  FOR v_stranded IN
    SELECT id FROM public.agent_mission_runs
     WHERE status IN ('queued', 'running')
     ORDER BY created_at
     LIMIT 25
  LOOP
    PERFORM public.agent_mission_ensure_job(v_stranded);
  END LOOP;

  IF to_regprocedure('public.trigger_agent_jobs()') IS NOT NULL THEN
    PERFORM public.trigger_agent_jobs();
  END IF;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_due_agent_missions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_agent_missions() TO service_role;

ALTER TABLE public.agent_mission_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_mission_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_mission_digests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_mission_grants_select ON public.agent_mission_grants;
CREATE POLICY agent_mission_grants_select ON public.agent_mission_grants
  FOR SELECT TO authenticated
  USING (user_id = public.agent_mission_workspace_owner());

DROP POLICY IF EXISTS agent_mission_grants_admin ON public.agent_mission_grants;
CREATE POLICY agent_mission_grants_admin ON public.agent_mission_grants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS agent_missions_rw ON public.agent_missions;
CREATE POLICY agent_missions_rw ON public.agent_missions
  FOR ALL TO authenticated
  USING (user_id = public.agent_mission_workspace_owner() AND public.agent_missions_enabled())
  WITH CHECK (user_id = public.agent_mission_workspace_owner() AND public.agent_missions_enabled());

DROP POLICY IF EXISTS agent_mission_runs_select ON public.agent_mission_runs;
CREATE POLICY agent_mission_runs_select ON public.agent_mission_runs
  FOR SELECT TO authenticated
  USING (user_id = public.agent_mission_workspace_owner() AND public.agent_missions_enabled());

DROP POLICY IF EXISTS agent_mission_digests_select ON public.agent_mission_digests;
CREATE POLICY agent_mission_digests_select ON public.agent_mission_digests
  FOR SELECT TO authenticated
  USING (user_id = public.agent_mission_workspace_owner() AND public.agent_missions_enabled());

REVOKE ALL ON public.agent_mission_grants FROM PUBLIC, anon;
REVOKE ALL ON public.agent_missions FROM PUBLIC, anon;
REVOKE ALL ON public.agent_mission_runs FROM PUBLIC, anon;
REVOKE ALL ON public.agent_mission_digests FROM PUBLIC, anon;

GRANT SELECT ON public.agent_mission_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_missions TO authenticated;
GRANT SELECT ON public.agent_mission_runs TO authenticated;
GRANT SELECT ON public.agent_mission_digests TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.agent_mission_grants TO authenticated;

GRANT ALL ON public.agent_mission_grants TO service_role;
GRANT ALL ON public.agent_missions TO service_role;
GRANT ALL ON public.agent_mission_runs TO service_role;
GRANT ALL ON public.agent_mission_digests TO service_role;

DO $$
BEGIN
  IF to_regclass('public.feature_flags') IS NOT NULL THEN
    INSERT INTO public.feature_flags (name, description, is_enabled, target_plans)
    VALUES (
      'agentMissions',
      'Standing agent missions. Off unless also granted per workspace. Plan caps still apply.',
      false,
      ARRAY['free', 'starter', 'growth', 'pro', 'agency']
    )
    ON CONFLICT (name) DO NOTHING;
  END IF;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('dispatch-agent-missions');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'dispatch-agent-missions',
    '*/5 * * * *',
    $cmd$ SELECT public.enqueue_due_agent_missions(); $cmd$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'dispatch-agent-missions not scheduled: %', SQLERRM;
END $$;

DO $regression$
BEGIN
  IF to_regclass('public.feature_flags') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.feature_flags
      WHERE name = 'agentMissions' AND is_enabled IS FALSE
    ) AND NOT EXISTS (
      SELECT 1 FROM public.feature_flags WHERE name = 'agentMissions'
    ) THEN
      RAISE EXCEPTION 'Regression: agentMissions flag was not created';
    END IF;
    -- A fresh insert is off. Re-applying this migration must not flip a flag an admin already enabled.
    IF NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE name = 'agentMissions') THEN
      RAISE EXCEPTION 'Regression: agentMissions flag missing';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'agent_missions' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Regression: agent_missions RLS is off';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    IF has_function_privilege('authenticated', 'public.claim_agent_mission_run(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Regression: claim_agent_mission_run is executable by authenticated';
    END IF;
    IF has_function_privilege('authenticated', 'public.enqueue_due_agent_missions()', 'EXECUTE') THEN
      RAISE EXCEPTION 'Regression: enqueue_due_agent_missions is executable by authenticated';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    IF has_function_privilege('anon', 'public.claim_agent_mission_run(uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Regression: claim_agent_mission_run is executable by anon';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'agent_mission_runs_mission_fkey'
       AND pg_get_constraintdef(oid) LIKE '%(user_id, mission_id)%'
  ) THEN
    RAISE EXCEPTION 'Regression: mission runs are not tenant-keyed';
  END IF;
END
$regression$;
