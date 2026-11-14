-- Restores five GitHub migrations (20261106140000, 20261107120000, 20261107133000,
-- 20261107143000 via its superseding repair 20261110120000) that never reached
-- the hosted database. Without them research-lead cannot store snapshots and
-- every draft/send is refused as "research_required".

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
  CONSTRAINT outbound_verdicts_status_check CHECK (gate_status IN ('clear', 'needs_review', 'refused')),
  CONSTRAINT outbound_verdicts_rubric_check CHECK (rubric_availability IN ('scored', 'plan_gated', 'unavailable'))
);
CREATE INDEX IF NOT EXISTS outbound_verdicts_user_hash_idx ON public.outbound_verdicts (user_id, content_hash, created_at DESC);

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
  payload jsonb,
  subject_key uuid NOT NULL,
  CONSTRAINT outbound_run_steps_phase_check CHECK (phase IN ('research', 'draft', 'score', 'hold', 'send')),
  CONSTRAINT outbound_run_steps_status_check CHECK (status IN ('open', 'leased', 'done', 'cancelled', 'failed')),
  CONSTRAINT outbound_run_steps_subject_unique UNIQUE (user_id, subject_key, run_id, phase)
);

CREATE TABLE IF NOT EXISTS public.outbound_durable_runs (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.outbound_runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_runs_status_check CHECK (status IN ('open', 'closed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS outbound_runs_user_open_idx ON public.outbound_runs (user_id, updated_at DESC) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.agent_tool_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id uuid,
  tool_name text NOT NULL,
  status text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_tool_receipts_status_check CHECK (status IN ('requested', 'approved', 'attempted', 'failed', 'provider_accepted_unpersisted', 'ok'))
);

CREATE TABLE IF NOT EXISTS public.research_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS research_snapshots_lead_idx ON public.research_snapshots (user_id, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  receipt jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS research_runs_lead_idx ON public.research_runs (user_id, lead_id, attempted_at DESC);

-- Grants: service-written tables; owners may read their own rows.
REVOKE ALL ON TABLE public.outbound_verdicts, public.outbound_gate_canary, public.outbound_run_steps,
  public.outbound_runs, public.outbound_durable_runs, public.agent_tool_receipts,
  public.research_snapshots, public.research_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.outbound_verdicts, public.outbound_run_steps, public.outbound_runs,
  public.outbound_durable_runs, public.agent_tool_receipts, public.research_snapshots, public.research_runs TO authenticated;
GRANT ALL ON TABLE public.outbound_verdicts, public.outbound_gate_canary, public.outbound_run_steps,
  public.outbound_runs, public.outbound_durable_runs, public.agent_tool_receipts,
  public.research_snapshots, public.research_runs TO service_role;

ALTER TABLE public.outbound_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_gate_canary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_durable_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbound_verdicts_owner_read ON public.outbound_verdicts;
CREATE POLICY outbound_verdicts_owner_read ON public.outbound_verdicts FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS outbound_run_steps_owner_read ON public.outbound_run_steps;
CREATE POLICY outbound_run_steps_owner_read ON public.outbound_run_steps FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS outbound_runs_owner_read ON public.outbound_runs;
CREATE POLICY outbound_runs_owner_read ON public.outbound_runs FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS outbound_durable_runs_owner_read ON public.outbound_durable_runs;
CREATE POLICY outbound_durable_runs_owner_read ON public.outbound_durable_runs FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS agent_tool_receipts_owner_read ON public.agent_tool_receipts;
CREATE POLICY agent_tool_receipts_owner_read ON public.agent_tool_receipts FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS research_snapshots_owner_read ON public.research_snapshots;
CREATE POLICY research_snapshots_owner_read ON public.research_snapshots FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS research_runs_owner_read ON public.research_runs;
CREATE POLICY research_runs_owner_read ON public.research_runs FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.record_outbound_verdict(
  p_user_id uuid, p_lead_id uuid, p_content_hash text, p_subject text, p_body text, p_findings jsonb,
  p_rubric_availability text, p_rubric jsonb, p_prompt_hash text, p_rubric_prompt_hash text,
  p_gate_status text, p_shadow boolean, p_shadow_mismatch boolean
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.outbound_verdicts (
    user_id, lead_id, content_hash, subject, body, findings, rubric_availability, rubric, prompt_hash,
    rubric_prompt_hash, gate_status, shadow, shadow_mismatch
  ) VALUES (
    p_user_id, p_lead_id, p_content_hash, p_subject, p_body, COALESCE(p_findings, '[]'::jsonb),
    p_rubric_availability, p_rubric, p_prompt_hash, p_rubric_prompt_hash,
    p_gate_status, COALESCE(p_shadow, true), COALESCE(p_shadow_mismatch, false)
  ) RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_verdict_to_send(p_verdict_id uuid, p_sent_email_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.outbound_verdicts SET sent_email_id = p_sent_email_id WHERE id = p_verdict_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.latest_outbound_verdict(p_user_id uuid, p_content_hash text)
RETURNS TABLE (id uuid, content_hash text, gate_status text, prompt_hash text, rubric_prompt_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.content_hash, v.gate_status, v.prompt_hash, v.rubric_prompt_hash
    FROM public.outbound_verdicts v
   WHERE v.user_id = p_user_id AND v.content_hash = p_content_hash
   ORDER BY v.created_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.outbound_canary_enabled(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT enabled FROM public.outbound_gate_canary WHERE user_id = p_user_id), false);
$$;

DROP FUNCTION IF EXISTS public.claim_agent_run_step(uuid, uuid, uuid, text, text, integer, integer);
DROP FUNCTION IF EXISTS public.claim_agent_run_step(uuid, uuid, uuid, text, text, integer, integer, uuid);
CREATE OR REPLACE FUNCTION public.claim_agent_run_step(
  p_user_id uuid, p_lead_id uuid, p_run_id uuid, p_phase text, p_owner text,
  p_lease_seconds integer, p_max_attempts integer, p_subject_key uuid DEFAULT NULL
) RETURNS TABLE (step_id uuid, step_status text, attempt_count integer, payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.outbound_run_steps%ROWTYPE;
BEGIN
  INSERT INTO public.outbound_run_steps (user_id, lead_id, run_id, phase, status, subject_key)
  VALUES (p_user_id, p_lead_id, p_run_id, p_phase, 'open', COALESCE(p_subject_key, p_lead_id))
  ON CONFLICT (user_id, subject_key, run_id, phase) DO NOTHING;

  SELECT * INTO _row FROM public.outbound_run_steps
   WHERE user_id = p_user_id AND subject_key = COALESCE(p_subject_key, p_lead_id)
     AND run_id = p_run_id AND phase = p_phase
   FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.outbound_runs WHERE id = p_run_id AND user_id = p_user_id AND status = 'cancelled')
     AND _row.status <> 'done' THEN
    UPDATE public.outbound_run_steps SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = _row.id;
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
  IF _row.status = 'leased' AND _row.lease_expires_at IS NOT NULL AND _row.lease_expires_at > now()
     AND _row.lease_owner IS DISTINCT FROM p_owner THEN
    RETURN QUERY SELECT _row.id, 'busy'::text, _row.attempt_count, _row.payload;
    RETURN;
  END IF;
  IF _row.attempt_count >= p_max_attempts THEN
    UPDATE public.outbound_run_steps SET status = 'failed', lease_owner = NULL, lease_expires_at = NULL, updated_at = now() WHERE id = _row.id;
    RETURN QUERY SELECT _row.id, 'exhausted'::text, _row.attempt_count, _row.payload;
    RETURN;
  END IF;

  UPDATE public.outbound_run_steps
     SET status = 'leased', attempt_count = public.outbound_run_steps.attempt_count + 1,
         lease_owner = p_owner, lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
   WHERE id = _row.id
   RETURNING * INTO _row;
  RETURN QUERY SELECT _row.id, 'claimed'::text, _row.attempt_count, _row.payload;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_agent_run_step(uuid, text);
DROP FUNCTION IF EXISTS public.complete_agent_run_step(uuid, text, jsonb);
CREATE OR REPLACE FUNCTION public.complete_agent_run_step(p_step_id uuid, p_owner text, p_payload jsonb DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.outbound_run_steps
     SET status = 'done', payload = COALESCE(p_payload, payload), lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE id = p_step_id AND lease_owner = p_owner AND status = 'leased' AND lease_expires_at > now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_step_owned(p_step_id uuid, p_owner text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.outbound_run_steps
    WHERE id = p_step_id AND status = 'leased' AND lease_owner = p_owner AND lease_expires_at > now());
$$;

CREATE OR REPLACE FUNCTION public.open_outbound_run(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _run uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  SELECT id INTO _run FROM public.outbound_runs WHERE user_id = p_user_id AND status = 'open'
   ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
  IF _run IS NULL THEN
    _run := gen_random_uuid();
    INSERT INTO public.outbound_runs (id, user_id, status) VALUES (_run, p_user_id, 'open');
  END IF;
  RETURN _run;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_outbound_run(p_user_id uuid, p_run_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.outbound_run_steps
     WHERE user_id = p_user_id AND run_id = p_run_id AND status IN ('open', 'leased', 'failed')) THEN
    RETURN false;
  END IF;
  UPDATE public.outbound_runs SET status = 'closed', updated_at = now()
   WHERE id = p_run_id AND user_id = p_user_id AND status = 'open';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_agent_run(p_user_id uuid, p_run_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.outbound_run_steps SET status = 'cancelled', lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE user_id = p_user_id AND run_id = p_run_id AND status <> 'done';
  GET DIAGNOSTICS _n = ROW_COUNT;
  INSERT INTO public.outbound_runs (id, user_id, status) VALUES (p_run_id, p_user_id, 'cancelled')
  ON CONFLICT (id) DO UPDATE SET status = 'cancelled', updated_at = now()
    WHERE public.outbound_runs.user_id = EXCLUDED.user_id;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_agent_tool_receipt(p_user_id uuid, p_run_id uuid, p_tool_name text, p_status text, p_detail text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.agent_tool_receipts (user_id, run_id, tool_name, status, detail)
  VALUES (p_user_id, p_run_id, p_tool_name, p_status, p_detail) RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.outbound_durable_enabled(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT enabled FROM public.outbound_durable_runs WHERE user_id = p_user_id), false);
$$;

CREATE OR REPLACE FUNCTION public.list_agent_tool_receipts(p_user_id uuid, p_run_id uuid)
RETURNS TABLE (tool_name text, status text, detail text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.tool_name, r.status, r.detail FROM public.agent_tool_receipts r
   WHERE r.user_id = p_user_id AND r.run_id = p_run_id ORDER BY r.created_at;
$$;

CREATE OR REPLACE FUNCTION public.replace_research_snapshots(p_user_id uuid, p_lead_id uuid, p_rows jsonb, p_receipt jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_lead_id::text, 0));
  DELETE FROM public.research_snapshots WHERE user_id = p_user_id AND lead_id = p_lead_id;
  INSERT INTO public.research_snapshots (user_id, lead_id, payload)
  SELECT p_user_id, p_lead_id, value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb));
  INSERT INTO public.research_runs (user_id, lead_id, receipt) VALUES (p_user_id, p_lead_id, COALESCE(p_receipt, '{}'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_research_run(p_user_id uuid, p_lead_id uuid, p_force boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing uuid; created uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_lead_id::text, 0));
  IF NOT p_force THEN
    SELECT id INTO existing FROM public.research_runs
     WHERE user_id = p_user_id AND lead_id = p_lead_id AND attempted_at > now() - interval '10 minutes'
     ORDER BY attempted_at DESC LIMIT 1;
    IF existing IS NOT NULL THEN
      RETURN NULL;
    END IF;
  END IF;
  INSERT INTO public.research_runs (user_id, lead_id, receipt) VALUES (p_user_id, p_lead_id, '{"status":"started"}'::jsonb)
  RETURNING id INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_research_snapshots(p_user_id uuid, p_lead_id uuid, p_rows jsonb, p_receipt jsonb, p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_lead_id::text, 0));
  IF jsonb_typeof(p_rows) = 'array' AND jsonb_array_length(p_rows) > 0 THEN
    DELETE FROM public.research_snapshots WHERE user_id = p_user_id AND lead_id = p_lead_id;
    INSERT INTO public.research_snapshots (user_id, lead_id, payload)
    SELECT p_user_id, p_lead_id, value FROM jsonb_array_elements(p_rows);
  END IF;
  UPDATE public.research_runs SET receipt = COALESCE(p_receipt, '{}'::jsonb)
   WHERE id = p_run_id AND user_id = p_user_id AND lead_id = p_lead_id;
END;
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.record_outbound_verdict(uuid, uuid, text, text, text, jsonb, text, jsonb, text, text, text, boolean, boolean)',
    'public.attach_verdict_to_send(uuid, uuid, uuid)',
    'public.latest_outbound_verdict(uuid, text)',
    'public.outbound_canary_enabled(uuid)',
    'public.claim_agent_run_step(uuid, uuid, uuid, text, text, integer, integer, uuid)',
    'public.outbound_durable_enabled(uuid)',
    'public.list_agent_tool_receipts(uuid, uuid)',
    'public.complete_agent_run_step(uuid, text, jsonb)',
    'public.agent_step_owned(uuid, text)',
    'public.open_outbound_run(uuid)',
    'public.close_outbound_run(uuid, uuid)',
    'public.cancel_agent_run(uuid, uuid)',
    'public.record_agent_tool_receipt(uuid, uuid, text, text, text)',
    'public.replace_research_snapshots(uuid, uuid, jsonb, jsonb)',
    'public.begin_research_run(uuid, uuid, boolean)',
    'public.store_research_snapshots(uuid, uuid, jsonb, jsonb, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.agent_run_mutations') IS NOT NULL THEN
    ALTER TABLE public.agent_run_mutations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_run_mutations_status_check') THEN
      ALTER TABLE public.agent_run_mutations ADD CONSTRAINT agent_run_mutations_status_check
        CHECK (status IN ('dispatching', 'completed', 'unknown'));
    END IF;
  END IF;
END $$;