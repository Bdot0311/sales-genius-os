-- Verdicts, run steps, and tool receipts for the approved outbound build.
--
-- The live quality gate still decides every send. A verdict is written in
-- shadow and compared. It authorizes a send only when outbound_gate_canary
-- is enabled for that account. This migration inserts no canary rows, so
-- every account stays off. Rollback is to stop reading the canary. Do not
-- go back to sending on blockers alone.

CREATE TABLE IF NOT EXISTS public.outbound_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid,
  content_hash text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  rubric_availability text NOT NULL,
  rubric jsonb,
  prompt_hash text NOT NULL,
  rubric_prompt_hash text NOT NULL,
  gate_status text NOT NULL,
  shadow boolean NOT NULL DEFAULT true,
  shadow_mismatch boolean NOT NULL DEFAULT false,
  sent_email_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_verdicts_status_check
    CHECK (gate_status IN ('clear', 'needs_review', 'refused')),
  CONSTRAINT outbound_verdicts_rubric_check
    CHECK (rubric_availability IN ('scored', 'plan_gated', 'unavailable'))
);

CREATE INDEX IF NOT EXISTS outbound_verdicts_user_hash_idx
  ON public.outbound_verdicts (user_id, content_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS public.outbound_gate_canary (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outbound_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  run_id uuid NOT NULL,
  phase text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  attempt_count integer NOT NULL DEFAULT 0,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_run_steps_phase_check
    CHECK (phase IN ('research', 'draft', 'score', 'hold', 'send')),
  CONSTRAINT outbound_run_steps_status_check
    CHECK (status IN ('open', 'leased', 'done', 'cancelled', 'failed')),
  CONSTRAINT outbound_run_steps_unique UNIQUE (user_id, lead_id, run_id, phase)
);

ALTER TABLE public.outbound_run_steps ADD COLUMN IF NOT EXISTS payload jsonb;

-- One open run per account. open_outbound_run creates or returns it under a
-- lock, so two overlapping agent-run calls share the id and then the step
-- lease. A new id is issued only after this row is closed or cancelled.
CREATE TABLE IF NOT EXISTS public.outbound_runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_runs_status_check CHECK (status IN ('open', 'closed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS outbound_runs_user_open_idx
  ON public.outbound_runs (user_id, updated_at DESC)
  WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.agent_tool_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id uuid,
  tool_name text NOT NULL,
  status text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_tool_receipts_status_check
    CHECK (status IN (
      'requested', 'approved', 'attempted', 'failed',
      'provider_accepted_unpersisted', 'ok'
    ))
);

ALTER TABLE public.outbound_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_gate_canary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_receipts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON TABLE public.outbound_verdicts FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public.outbound_gate_canary FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public.outbound_run_steps FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public.outbound_runs FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public.agent_tool_receipts FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.outbound_verdicts FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.outbound_gate_canary FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.outbound_run_steps FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.outbound_runs FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.agent_tool_receipts FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.outbound_verdicts FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.outbound_gate_canary FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.outbound_run_steps FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.outbound_runs FROM authenticated';
    EXECUTE 'REVOKE ALL ON TABLE public.agent_tool_receipts FROM authenticated';
  END IF;
END $$;

-- Owner read policies need auth.uid(), which exists on Supabase and not on
-- a bare Postgres used for the lease tests. The definer functions do the writes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS outbound_verdicts_owner_read ON public.outbound_verdicts';
    EXECUTE 'CREATE POLICY outbound_verdicts_owner_read ON public.outbound_verdicts FOR SELECT USING (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS outbound_run_steps_owner_read ON public.outbound_run_steps';
    EXECUTE 'CREATE POLICY outbound_run_steps_owner_read ON public.outbound_run_steps FOR SELECT USING (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS outbound_runs_owner_read ON public.outbound_runs';
    EXECUTE 'CREATE POLICY outbound_runs_owner_read ON public.outbound_runs FOR SELECT USING (user_id = auth.uid())';
    EXECUTE 'DROP POLICY IF EXISTS agent_tool_receipts_owner_read ON public.agent_tool_receipts';
    EXECUTE 'CREATE POLICY agent_tool_receipts_owner_read ON public.agent_tool_receipts FOR SELECT USING (user_id = auth.uid())';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_outbound_verdict(
  p_user_id uuid,
  p_lead_id uuid,
  p_content_hash text,
  p_subject text,
  p_body text,
  p_findings jsonb,
  p_rubric_availability text,
  p_rubric jsonb,
  p_prompt_hash text,
  p_rubric_prompt_hash text,
  p_gate_status text,
  p_shadow boolean,
  p_shadow_mismatch boolean
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.outbound_verdicts (
    user_id, lead_id, content_hash, subject, body, findings,
    rubric_availability, rubric, prompt_hash, rubric_prompt_hash,
    gate_status, shadow, shadow_mismatch
  ) VALUES (
    p_user_id, p_lead_id, p_content_hash, p_subject, p_body, COALESCE(p_findings, '[]'::jsonb),
    p_rubric_availability, p_rubric, p_prompt_hash, p_rubric_prompt_hash,
    p_gate_status, COALESCE(p_shadow, true), COALESCE(p_shadow_mismatch, false)
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_verdict_to_send(
  p_verdict_id uuid,
  p_sent_email_id uuid,
  p_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.outbound_verdicts
     SET sent_email_id = p_sent_email_id
   WHERE id = p_verdict_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.latest_outbound_verdict(
  p_user_id uuid,
  p_content_hash text
) RETURNS TABLE (
  id uuid,
  content_hash text,
  gate_status text,
  prompt_hash text,
  rubric_prompt_hash text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, content_hash, gate_status, prompt_hash, rubric_prompt_hash
    FROM public.outbound_verdicts
   WHERE user_id = p_user_id AND content_hash = p_content_hash
   ORDER BY created_at DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.outbound_canary_enabled(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT enabled FROM public.outbound_gate_canary WHERE user_id = p_user_id),
    false
  );
$$;

DROP FUNCTION IF EXISTS public.claim_agent_run_step(uuid, uuid, uuid, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.claim_agent_run_step(
  p_user_id uuid,
  p_lead_id uuid,
  p_run_id uuid,
  p_phase text,
  p_owner text,
  p_lease_seconds integer,
  p_max_attempts integer
) RETURNS TABLE (step_id uuid, step_status text, attempt_count integer, payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.outbound_run_steps%ROWTYPE;
BEGIN
  INSERT INTO public.outbound_run_steps (user_id, lead_id, run_id, phase, status)
  VALUES (p_user_id, p_lead_id, p_run_id, p_phase, 'open')
  ON CONFLICT (user_id, lead_id, run_id, phase) DO NOTHING;

  SELECT * INTO _row
    FROM public.outbound_run_steps
   WHERE user_id = p_user_id AND lead_id = p_lead_id
     AND run_id = p_run_id AND phase = p_phase
   FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.outbound_runs
     WHERE id = p_run_id AND user_id = p_user_id AND status = 'cancelled'
  ) AND _row.status <> 'done' THEN
    UPDATE public.outbound_run_steps
       SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
     WHERE id = _row.id;
    RETURN QUERY SELECT _row.id, 'cancelled'::text, _row.attempt_count, _row.payload;
    RETURN;
  END IF;

  IF _row.status = 'cancelled' THEN
    RETURN QUERY SELECT _row.id, 'cancelled'::text, _row.attempt_count, _row.payload;
    RETURN;
  END IF;
  IF _row.status = 'done' THEN
    RETURN QUERY SELECT _row.id, 'done'::text, _row.attempt_count, _row.payload;
    RETURN;
  END IF;
  IF _row.status = 'leased'
     AND _row.lease_expires_at IS NOT NULL
     AND _row.lease_expires_at > now()
     AND _row.lease_owner IS DISTINCT FROM p_owner THEN
    RETURN QUERY SELECT _row.id, 'busy'::text, _row.attempt_count, _row.payload;
    RETURN;
  END IF;
  IF _row.attempt_count >= p_max_attempts THEN
    UPDATE public.outbound_run_steps
       SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
     WHERE id = _row.id;
    RETURN QUERY SELECT _row.id, 'exhausted'::text, _row.attempt_count, _row.payload;
    RETURN;
  END IF;

  UPDATE public.outbound_run_steps
     SET status = 'leased',
         attempt_count = public.outbound_run_steps.attempt_count + 1,
         lease_owner = p_owner,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   WHERE id = _row.id
   RETURNING * INTO _row;

  RETURN QUERY SELECT _row.id, 'claimed'::text, _row.attempt_count, _row.payload;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_agent_run_step(uuid, text);
DROP FUNCTION IF EXISTS public.complete_agent_run_step(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.complete_agent_run_step(
  p_step_id uuid,
  p_owner text,
  p_payload jsonb DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.outbound_run_steps
     SET status = 'done',
         payload = COALESCE(p_payload, payload),
         lease_owner = NULL,
         lease_expires_at = NULL,
         updated_at = now()
   WHERE id = p_step_id
     AND lease_owner = p_owner
     AND status = 'leased'
     AND lease_expires_at > now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_step_owned(
  p_step_id uuid,
  p_owner text
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.outbound_run_steps
     WHERE id = p_step_id
       AND status = 'leased'
       AND lease_owner = p_owner
       AND lease_expires_at > now()
  );
$$;

-- The next invocation of agent-run is the recovery entry. It is the same
-- authorized function. Overlapping calls take the same open run, then the
-- step lease decides who may run a phase. A crashed call leaves the row
-- open, so the next call resumes it instead of minting a second run.
CREATE OR REPLACE FUNCTION public.open_outbound_run(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _run uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  SELECT id INTO _run
    FROM public.outbound_runs
   WHERE user_id = p_user_id AND status = 'open'
   ORDER BY updated_at DESC
   LIMIT 1
   FOR UPDATE;
  IF _run IS NULL THEN
    _run := gen_random_uuid();
    INSERT INTO public.outbound_runs (id, user_id, status)
    VALUES (_run, p_user_id, 'open');
  END IF;
  RETURN _run;
END;
$$;

-- Close only when nothing is still open, leased, or exhausted. A leased send
-- keeps the run resumable. Cancel is the way to abandon it.
CREATE OR REPLACE FUNCTION public.close_outbound_run(p_user_id uuid, p_run_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.outbound_run_steps
     WHERE user_id = p_user_id
       AND run_id = p_run_id
       AND status IN ('open', 'leased', 'failed')
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.outbound_runs
     SET status = 'closed', updated_at = now()
   WHERE id = p_run_id AND user_id = p_user_id AND status = 'open';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_agent_run(
  p_user_id uuid,
  p_run_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _n integer;
BEGIN
  UPDATE public.outbound_run_steps
     SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE user_id = p_user_id AND run_id = p_run_id AND status <> 'done';
  GET DIAGNOSTICS _n = ROW_COUNT;
  INSERT INTO public.outbound_runs (id, user_id, status)
  VALUES (p_run_id, p_user_id, 'cancelled')
  ON CONFLICT (id) DO UPDATE
    SET status = 'cancelled', updated_at = now()
    WHERE public.outbound_runs.user_id = EXCLUDED.user_id;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_agent_tool_receipt(
  p_user_id uuid,
  p_run_id uuid,
  p_tool_name text,
  p_status text,
  p_detail text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.agent_tool_receipts (user_id, run_id, tool_name, status, detail)
  VALUES (p_user_id, p_run_id, p_tool_name, p_status, p_detail)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- These functions take a user id and bypass RLS. Authenticated callers must
-- not invoke them; agent-run and send-email call them with the service role
-- after auth.getUser. A missing service_role (local Postgres) still leaves
-- PUBLIC and authenticated revoked.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.record_outbound_verdict(uuid, uuid, text, text, text, jsonb, text, jsonb, text, text, text, boolean, boolean)',
    'public.attach_verdict_to_send(uuid, uuid, uuid)',
    'public.latest_outbound_verdict(uuid, text)',
    'public.outbound_canary_enabled(uuid)',
    'public.claim_agent_run_step(uuid, uuid, uuid, text, text, integer, integer)',
    'public.complete_agent_run_step(uuid, text, jsonb)',
    'public.agent_step_owned(uuid, text)',
    'public.open_outbound_run(uuid)',
    'public.close_outbound_run(uuid, uuid)',
    'public.cancel_agent_run(uuid, uuid)',
    'public.record_agent_tool_receipt(uuid, uuid, text, text, text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;
