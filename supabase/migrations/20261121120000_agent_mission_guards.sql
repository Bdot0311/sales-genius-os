-- Caps retries, finishes runs that can no longer proceed, shares the plan
-- lead cap across the workspace, and stops clients writing worker columns.

ALTER TABLE public.agent_mission_runs
  ADD COLUMN IF NOT EXISTS job_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE public.agent_mission_runs DROP CONSTRAINT IF EXISTS agent_mission_runs_job_attempts_check;
ALTER TABLE public.agent_mission_runs
  ADD CONSTRAINT agent_mission_runs_job_attempts_check
  CHECK (job_attempts BETWEEN 0 AND 3);

ALTER TABLE public.agent_missions DROP CONSTRAINT IF EXISTS agent_missions_bounce_rate_check;
ALTER TABLE public.agent_missions
  ADD CONSTRAINT agent_missions_bounce_rate_check
  CHECK (bounce_pause_rate >= 0.01 AND bounce_pause_rate <= 0.50);

ALTER TABLE public.agent_missions DROP CONSTRAINT IF EXISTS agent_missions_negative_rate_check;
ALTER TABLE public.agent_missions
  ADD CONSTRAINT agent_missions_negative_rate_check
  CHECK (negative_reply_pause_rate >= 0.05 AND negative_reply_pause_rate <= 0.50);

ALTER TABLE public.agent_missions DROP CONSTRAINT IF EXISTS agent_missions_max_runs_check;
ALTER TABLE public.agent_missions
  ADD CONSTRAINT agent_missions_max_runs_check
  CHECK (max_runs IS NULL OR (max_runs BETWEEN 1 AND 366));

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_missions_one_active
  ON public.agent_missions (user_id, agent_config_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.agent_mission_sends (
  run_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  user_id uuid NOT NULL,
  sent_email_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, lead_id)
);

ALTER TABLE public.agent_mission_sends DROP CONSTRAINT IF EXISTS agent_mission_sends_run_fkey;
ALTER TABLE public.agent_mission_sends
  ADD CONSTRAINT agent_mission_sends_run_fkey
  FOREIGN KEY (user_id, run_id)
  REFERENCES public.agent_mission_runs (user_id, id)
  ON DELETE CASCADE;

ALTER TABLE public.agent_mission_sends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_mission_sends FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_mission_sends TO service_role;

CREATE OR REPLACE FUNCTION public.agent_mission_actor()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'service';
  END IF;
  IF to_regclass('public.team_members') IS NOT NULL THEN
    EXECUTE
      'SELECT role FROM public.team_members WHERE member_user_id = $1 AND status = ''active'' ORDER BY created_at LIMIT 1'
      INTO v_role
      USING auth.uid();
    IF v_role IS NOT NULL THEN
      IF v_role IN ('admin', 'member') THEN
        RETURN v_role;
      END IF;
      RETURN 'none';
    END IF;
  END IF;
  RETURN 'owner';
END;
$$;

REVOKE ALL ON FUNCTION public.agent_mission_actor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agent_mission_actor() TO authenticated, service_role;

-- Invoker, so a direct client write is current_user = authenticated and a
-- security-definer status change is not.
CREATE OR REPLACE FUNCTION public.agent_mission_guard_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  actor text;
  schedule_changed boolean;
BEGIN
  IF NEW.stop_on IS NOT NULL AND (NEW.stop_on < CURRENT_DATE OR NEW.stop_on > CURRENT_DATE + 730) THEN
    RAISE EXCEPTION 'Stop date must be today or within the next two years';
  END IF;
  IF auth.uid() IS NULL OR current_user IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  actor := public.agent_mission_actor();
  IF actor NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'You cannot edit missions for this workspace';
  END IF;
  NEW.user_id := public.agent_mission_workspace_owner();
  IF NEW.mode = 'autopilot' AND actor NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only the workspace owner or an admin can turn on autopilot';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'active';
    NEW.pause_reason := NULL;
    NEW.last_run_at := NULL;
    NEW.next_run_at := public.agent_mission_next_run(now(), NEW.timezone, NEW.days_of_week, NEW.run_hour, NEW.run_minute);
  ELSE
    schedule_changed := NEW.timezone IS DISTINCT FROM OLD.timezone
      OR NEW.days_of_week IS DISTINCT FROM OLD.days_of_week
      OR NEW.run_hour IS DISTINCT FROM OLD.run_hour
      OR NEW.run_minute IS DISTINCT FROM OLD.run_minute;
    NEW.status := OLD.status;
    NEW.pause_reason := OLD.pause_reason;
    NEW.last_run_at := OLD.last_run_at;
    NEW.next_run_at := CASE
      WHEN schedule_changed THEN public.agent_mission_next_run(now(), NEW.timezone, NEW.days_of_week, NEW.run_hour, NEW.run_minute)
      ELSE OLD.next_run_at
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_missions_guard_write ON public.agent_missions;
CREATE TRIGGER agent_missions_guard_write
  BEFORE INSERT OR UPDATE ON public.agent_missions
  FOR EACH ROW EXECUTE FUNCTION public.agent_mission_guard_write();

CREATE OR REPLACE FUNCTION public.set_agent_mission_status(p_id uuid, p_status text, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor text;
  v_mission public.agent_missions%ROWTYPE;
  v_reason text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_agent_mission_status needs a signed-in user';
  END IF;
  actor := public.agent_mission_actor();
  IF actor NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'You cannot change this mission';
  END IF;
  IF p_status NOT IN ('active', 'paused', 'stopped') THEN
    RAISE EXCEPTION 'status must be active, paused or stopped';
  END IF;
  SELECT * INTO v_mission FROM public.agent_missions
   WHERE id = p_id AND user_id = public.agent_mission_workspace_owner();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mission was not found in this workspace';
  END IF;
  IF p_status = 'active' AND v_mission.mode = 'autopilot' AND actor NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only the workspace owner or an admin can resume autopilot';
  END IF;
  v_reason := NULLIF(left(btrim(coalesce(p_reason, '')), 200), '');
  IF p_status = 'active' THEN
    v_reason := NULL;
  ELSIF v_reason IS NULL THEN
    v_reason := CASE WHEN p_status = 'paused' THEN 'Paused by you.' ELSE 'Stopped.' END;
  END IF;
  UPDATE public.agent_missions
     SET status = p_status,
         pause_reason = v_reason,
         next_run_at = CASE
           WHEN p_status = 'active' THEN public.agent_mission_next_run(now(), timezone, days_of_week, run_hour, run_minute)
           ELSE next_run_at
         END
   WHERE id = v_mission.id AND user_id = v_mission.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_agent_mission_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_agent_mission_status(uuid, text, text) TO authenticated;

REVOKE INSERT, UPDATE ON public.agent_missions FROM authenticated;
GRANT INSERT (
  user_id, agent_config_id, icp_profile_id, sequence_id, name, goal, mode,
  timezone, days_of_week, run_hour, run_minute, send_window_start, send_window_end,
  daily_lead_cap, daily_send_cap, daily_spend_cap_usd,
  bounce_pause_rate, negative_reply_pause_rate, stop_on, max_runs
) ON public.agent_missions TO authenticated;
GRANT UPDATE (
  agent_config_id, icp_profile_id, sequence_id, name, goal, mode,
  timezone, days_of_week, run_hour, run_minute, send_window_start, send_window_end,
  daily_lead_cap, daily_send_cap, daily_spend_cap_usd,
  bounce_pause_rate, negative_reply_pause_rate, stop_on, max_runs
) ON public.agent_missions TO authenticated;

CREATE OR REPLACE FUNCTION public.agent_mission_leads_used_today(p_user_id uuid, p_timezone text, p_exclude_run uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  zone text := COALESCE(NULLIF(btrim(p_timezone), ''), 'UTC');
  start_at timestamptz;
  used integer;
  v_role text := '';
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'agent_mission_leads_used_today is internal';
    END IF;
  END IF;
  BEGIN
    start_at := date_trunc('day', now() AT TIME ZONE zone) AT TIME ZONE zone;
  EXCEPTION WHEN OTHERS THEN
    start_at := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  END;
  SELECT coalesce(sum(leads_found), 0)::integer INTO used
    FROM public.agent_mission_runs
   WHERE user_id = p_user_id
     AND created_at >= start_at
     AND (p_exclude_run IS NULL OR id <> p_exclude_run);
  RETURN used;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_mission_leads_used_today(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_mission_leads_used_today(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_agent_mission_send(p_run_id uuid, p_user_id uuid, p_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := '';
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'claim_agent_mission_send is internal';
    END IF;
  END IF;
  IF p_run_id IS NULL OR p_user_id IS NULL OR p_lead_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.agent_mission_runs WHERE id = p_run_id AND user_id = p_user_id) THEN
    RETURN false;
  END IF;
  INSERT INTO public.agent_mission_sends (run_id, lead_id, user_id)
  VALUES (p_run_id, p_lead_id, p_user_id);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_mission_send(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_agent_mission_send(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.finish_agent_mission_run(p_run_id uuid, p_status text, p_reason text, p_pause boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := '';
  v_run public.agent_mission_runs%ROWTYPE;
BEGIN
  IF to_regprocedure('auth.role()') IS NOT NULL THEN
    EXECUTE 'SELECT coalesce(auth.role(), '''')' INTO v_role;
    IF v_role IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'finish_agent_mission_run is internal';
    END IF;
  END IF;
  IF p_status NOT IN ('failed', 'skipped', 'paused') THEN
    RAISE EXCEPTION 'finish_agent_mission_run status must be final';
  END IF;
  SELECT * INTO v_run FROM public.agent_mission_runs WHERE id = p_run_id;
  IF NOT FOUND OR v_run.status NOT IN ('queued', 'running') THEN
    RETURN;
  END IF;
  UPDATE public.agent_mission_runs
     SET status = p_status,
         skip_reason = left(coalesce(p_reason, 'Mission run stopped.'), 400),
         finished_at = now()
   WHERE id = v_run.id AND user_id = v_run.user_id AND status IN ('queued', 'running');
  IF coalesce(p_pause, false) THEN
    UPDATE public.agent_missions
       SET status = 'paused',
           pause_reason = left(coalesce(p_reason, 'Paused after the mission run failed.'), 200)
     WHERE id = v_run.mission_id AND user_id = v_run.user_id AND status = 'active';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finish_agent_mission_run(uuid, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_agent_mission_run(uuid, text, text, boolean) TO service_role;

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
  v_flag boolean := false;
  v_reason text;
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

  SELECT * INTO v_run FROM public.agent_mission_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND OR v_run.status NOT IN ('queued', 'running') THEN
    RETURN NULL;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('agent-mission:' || v_run.mission_id::text, 0));
  SELECT * INTO v_mission FROM public.agent_missions WHERE id = v_run.mission_id AND user_id = v_run.user_id;
  IF to_regclass('public.feature_flags') IS NOT NULL THEN
    SELECT coalesce(is_enabled, false) INTO v_flag FROM public.feature_flags WHERE name = 'agentMissions';
  END IF;

  IF v_mission.id IS NULL OR v_mission.status <> 'active' THEN
    v_reason := 'Mission is not active.';
  ELSIF coalesce(v_flag, false) IS NOT TRUE THEN
    v_reason := 'Agent missions are off for this workspace.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.agent_mission_grants g WHERE g.user_id = v_run.user_id AND g.enabled IS TRUE
  ) THEN
    v_reason := 'This workspace is not granted agent missions.';
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.agent_mission_runs
       SET status = 'skipped', skip_reason = v_reason, finished_at = now()
     WHERE id = v_run.id AND user_id = v_run.user_id AND status IN ('queued', 'running');
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
    IF v_run.job_attempts >= 3 THEN
      UPDATE public.agent_mission_runs
         SET status = 'failed', skip_reason = 'Stopped after three attempts.', finished_at = now()
       WHERE id = v_run.id AND user_id = v_run.user_id;
      UPDATE public.agent_missions
         SET status = 'paused', pause_reason = 'Paused after the mission run failed three times.'
       WHERE id = v_mission.id AND user_id = v_mission.user_id AND status = 'active';
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.agent_jobs (user_id, agent_config_id, kind, request_text, autonomy, goal, status, total)
  VALUES (
    v_mission.user_id, v_mission.agent_config_id, 'mission', v_mission.goal,
    CASE WHEN v_mission.mode = 'autopilot' THEN 'autonomous' ELSE 'approval' END,
    'introduction', 'queued', GREATEST(v_mission.daily_send_cap, 1)
  )
  RETURNING id INTO v_job;

  INSERT INTO public.agent_job_items (job_id, user_id, status, payload)
  VALUES (v_job, v_mission.user_id, 'pending', jsonb_build_object('mission_id', v_mission.id, 'run_id', v_run.id));

  UPDATE public.agent_mission_runs
     SET job_id = v_job, status = 'running', job_attempts = job_attempts + 1
   WHERE id = v_run.id AND user_id = v_mission.user_id;
  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.agent_mission_ensure_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_mission_ensure_job(uuid) TO service_role;

DO $regression$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_missions_bounce_rate_check') THEN
    RAISE EXCEPTION 'Regression: bounce pause rate is unbounded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'uq_agent_missions_one_active') THEN
    RAISE EXCEPTION 'Regression: an agent can have two active missions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    IF has_column_privilege('authenticated', 'public.agent_missions', 'status', 'UPDATE') THEN
      RAISE EXCEPTION 'Regression: clients can write mission status';
    END IF;
    IF has_column_privilege('authenticated', 'public.agent_missions', 'next_run_at', 'UPDATE') THEN
      RAISE EXCEPTION 'Regression: clients can write next_run_at';
    END IF;
    IF has_column_privilege('authenticated', 'public.agent_missions', 'pause_reason', 'UPDATE') THEN
      RAISE EXCEPTION 'Regression: clients can write pause_reason';
    END IF;
    IF has_function_privilege('authenticated', 'public.claim_agent_mission_send(uuid, uuid, uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION 'Regression: claim_agent_mission_send is executable by authenticated';
    END IF;
  END IF;
END
$regression$;
