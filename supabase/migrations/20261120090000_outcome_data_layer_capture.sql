-- Outcome data layer, phase 1: capture features at the moment of send.
--
-- Why this exists. lead_decisions holds the whole AI Lead Intelligence output,
-- but _shared/lead-intelligence.ts upserts it on onConflict: "lead_id" -- one
-- row per lead, overwritten on every re-score. leads is mutable too. So the
-- decision and the lead attributes that were in force when an email went out
-- are destroyed the next time that lead is scored, and a model trained on the
-- current values would be trained on facts from after the send. These rows are
-- the point-in-time copy, written once and never updated.

CREATE TABLE IF NOT EXISTS public.lead_feature_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  -- "campaign" is email_sequences in this codebase; lead_decisions carries its
  -- own campaign_id, which is what gets copied here. Nullable: most sends are
  -- not enrolled in a sequence.
  campaign_id uuid,
  icp_profile_id uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),

  -- From lead_decisions. Text, not numeric: this scorer emits bands ("strong",
  -- "weak"), not numbers, and coercing them here would invent precision.
  icp_fit text,
  icp_fit_confidence numeric,
  buying_intent text,
  buying_intent_confidence numeric,
  email_priority text,
  email_priority_confidence numeric,
  send_recommendation text,
  send_recommendation_confidence numeric,

  -- From leads, numeric scores that do exist as numbers.
  fit_score numeric,
  intent_score numeric,
  signal_score numeric,

  -- Normalized lead attributes.
  seniority text,
  department text,
  company_size_band text,
  industry text,
  country text,
  email_verification_status text,
  source text,
  tier text,

  -- Signals. signal_recency_days is computed at capture time because
  -- signal_date moves and the age at send is what mattered.
  signal_types text[],
  strongest_signal_type text,
  signal_recency_days int,
  signal_count int,

  -- Everything else the scorer produced, for features we have not thought of.
  features_raw jsonb,
  scorer text,
  scorer_version text
);

COMMENT ON TABLE public.lead_feature_snapshots IS
  'Append-only. One row per outbound send, copied from lead_decisions and leads at send time. Never updated: see the UPDATE/DELETE policies and lead_feature_snapshots_immutable.';

CREATE INDEX IF NOT EXISTS idx_lfs_user ON public.lead_feature_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_lfs_lead ON public.lead_feature_snapshots(lead_id);
CREATE INDEX IF NOT EXISTS idx_lfs_captured ON public.lead_feature_snapshots(captured_at DESC);

ALTER TABLE public.lead_feature_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feature snapshots"
  ON public.lead_feature_snapshots FOR SELECT USING (auth.uid() = user_id);

-- No INSERT policy: rows are written only by capture_send_snapshot, which is
-- SECURITY DEFINER. A browser cannot forge training data.
-- No UPDATE or DELETE policy: absence denies under RLS. The trigger below
-- blocks the service role too, which RLS does not constrain.

CREATE OR REPLACE FUNCTION public.lead_feature_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead_feature_snapshots is append-only (attempted %)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_lfs_immutable ON public.lead_feature_snapshots;
CREATE TRIGGER trg_lfs_immutable
  BEFORE UPDATE OR DELETE ON public.lead_feature_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.lead_feature_snapshots_immutable();

-- Send-side columns. These extend sent_emails rather than living in a parallel
-- outbound_sends table: sent_emails already carries sequence_step, sequence_id,
-- enrollment_id, sending_account_id, status, sent_at and replied_at, and a
-- second row per send would give two answers to "was this sent".
ALTER TABLE public.sent_emails
  ADD COLUMN IF NOT EXISTS snapshot_id uuid REFERENCES public.lead_feature_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS send_hour_local int,
  ADD COLUMN IF NOT EXISTS send_weekday int,
  ADD COLUMN IF NOT EXISTS variant_id text,
  ADD COLUMN IF NOT EXISTS subject_word_count int,
  ADD COLUMN IF NOT EXISTS body_word_count int,
  ADD COLUMN IF NOT EXISTS has_question_cta boolean,
  ADD COLUMN IF NOT EXISTS has_link boolean,
  ADD COLUMN IF NOT EXISTS personalization_type text,
  ADD COLUMN IF NOT EXISTS quality_checker_score numeric,
  ADD COLUMN IF NOT EXISTS ai_generated boolean,
  ADD COLUMN IF NOT EXISTS user_edited boolean,
  ADD COLUMN IF NOT EXISTS edit_ratio numeric,
  ADD COLUMN IF NOT EXISTS sent_by text,
  ADD COLUMN IF NOT EXISTS agent_tier text;

CREATE INDEX IF NOT EXISTS idx_sent_emails_snapshot ON public.sent_emails(snapshot_id);

-- Normalizers. Immutable and standalone so the training export can call the
-- same function the snapshot was written with, rather than a second copy of
-- these boundaries that drifts.
CREATE OR REPLACE FUNCTION public.outcome_seniority_band(p_raw text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_raw IS NULL OR btrim(p_raw) = '' THEN 'unknown'
    WHEN lower(p_raw) ~ '(founder|co-?founder|owner|proprietor)' THEN 'founder'
    WHEN lower(p_raw) ~ '(chief|c-?level|^c[a-z]o$|cxo|president|partner)' THEN 'c_level'
    WHEN lower(p_raw) ~ '(vice ?president|^vp|svp|evp|head of)' THEN 'vp'
    WHEN lower(p_raw) ~ 'director' THEN 'director'
    WHEN lower(p_raw) ~ '(manager|lead|supervisor)' THEN 'manager'
    ELSE 'ic'
  END;
$$;

CREATE OR REPLACE FUNCTION public.outcome_company_size_band(p_employees int, p_raw text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  -- employee_count wins when present: it is a number. company_size is free
  -- text and only consulted as a fallback.
  SELECT CASE
    WHEN p_employees IS NOT NULL AND p_employees > 0 THEN CASE
      WHEN p_employees <= 10 THEN '1-10'
      WHEN p_employees <= 50 THEN '11-50'
      WHEN p_employees <= 200 THEN '51-200'
      WHEN p_employees <= 1000 THEN '201-1000'
      ELSE '1000+'
    END
    WHEN p_raw IS NULL OR btrim(p_raw) = '' THEN 'unknown'
    WHEN p_raw ~ '^\s*(1-10|11-50|51-200|201-1000|1000\+)\s*$' THEN btrim(p_raw)
    ELSE 'unknown'
  END;
$$;

-- Capture. One statement, mirroring attach_verdict_to_send: called after the
-- provider has accepted the message, so a capture failure can never stop a
-- send or cause a resend.
CREATE OR REPLACE FUNCTION public.capture_send_snapshot(
  p_sent_email_id uuid,
  p_user_id uuid,
  p_copy jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_sent_at timestamptz;
  v_snapshot_id uuid;
BEGIN
  SELECT lead_id, COALESCE(sent_at, now())
    INTO v_lead_id, v_sent_at
    FROM public.sent_emails
   WHERE id = p_sent_email_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Already captured: never write a second snapshot for one send.
  SELECT snapshot_id INTO v_snapshot_id
    FROM public.sent_emails WHERE id = p_sent_email_id;
  IF v_snapshot_id IS NOT NULL THEN
    RETURN v_snapshot_id;
  END IF;

  INSERT INTO public.lead_feature_snapshots (
    user_id, lead_id, campaign_id, captured_at,
    icp_fit, icp_fit_confidence, buying_intent, buying_intent_confidence,
    email_priority, email_priority_confidence,
    send_recommendation, send_recommendation_confidence,
    fit_score, intent_score, signal_score,
    seniority, department, company_size_band, industry, country,
    email_verification_status, source, tier,
    signal_types, strongest_signal_type, signal_recency_days, signal_count,
    features_raw, scorer, scorer_version
  )
  SELECT
    p_user_id, l.id, d.campaign_id, v_sent_at,
    d.icp_fit, d.icp_fit_confidence, d.buying_intent, d.buying_intent_confidence,
    d.email_priority, d.email_priority_confidence,
    d.send_recommendation, d.send_recommendation_confidence,
    l.fit_score, l.intent_score, l.signal_score,
    public.outcome_seniority_band(COALESCE(l.seniority, l.job_title)),
    l.department,
    public.outcome_company_size_band(l.employee_count, l.company_size),
    l.industry, l.country,
    l.email_verification_status, l.source, l.tier,
    sig.types, sig.strongest,
    CASE WHEN l.signal_date IS NULL THEN NULL
         ELSE GREATEST(0, (v_sent_at::date - l.signal_date::date)) END,
    COALESCE(sig.cnt, 0),
    jsonb_strip_nulls(jsonb_build_object(
      'input_snapshot', d.input_snapshot,
      'input_fingerprint', d.input_fingerprint,
      'cta_strategy', d.cta_strategy,
      'subject_strategy', d.subject_strategy,
      'sequence_length', d.sequence_length,
      'follow_up_timing', d.follow_up_timing,
      'personalization_depth', d.personalization_depth,
      'automation_review', d.automation_review,
      'lead_signals', l.signals,
      'lead_signal_layers', l.signal_layers,
      'lead_score_breakdown', l.score_breakdown,
      'research_confidence', l.research_confidence
    )),
    COALESCE(d.provider, 'none'),
    COALESCE(d.provider_model, 'none')
  FROM public.leads l
  LEFT JOIN public.lead_decisions d
         ON d.lead_id = l.id AND d.user_id = p_user_id
  LEFT JOIN LATERAL (
    SELECT array_agg(DISTINCT s.signal_type) AS types,
           (array_agg(s.signal_type ORDER BY s.weight DESC NULLS LAST, s.occurred_at DESC))[1] AS strongest,
           count(*)::int AS cnt
      FROM public.signal_events s
     WHERE s.lead_id = l.id AND s.user_id = p_user_id AND s.occurred_at <= v_sent_at
  ) sig ON TRUE
  WHERE l.id = v_lead_id
  RETURNING id INTO v_snapshot_id;

  IF v_snapshot_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.sent_emails SET
    snapshot_id = v_snapshot_id,
    send_hour_local = EXTRACT(HOUR FROM v_sent_at)::int,
    send_weekday = EXTRACT(ISODOW FROM v_sent_at)::int,
    subject_word_count  = NULLIF((p_copy->>'subject_word_count'), '')::int,
    body_word_count     = NULLIF((p_copy->>'body_word_count'), '')::int,
    has_question_cta    = NULLIF((p_copy->>'has_question_cta'), '')::boolean,
    has_link            = NULLIF((p_copy->>'has_link'), '')::boolean,
    personalization_type= NULLIF((p_copy->>'personalization_type'), ''),
    quality_checker_score = NULLIF((p_copy->>'quality_checker_score'), '')::numeric,
    ai_generated        = NULLIF((p_copy->>'ai_generated'), '')::boolean,
    user_edited         = NULLIF((p_copy->>'user_edited'), '')::boolean,
    edit_ratio          = NULLIF((p_copy->>'edit_ratio'), '')::numeric,
    sent_by             = NULLIF((p_copy->>'sent_by'), ''),
    agent_tier          = NULLIF((p_copy->>'agent_tier'), ''),
    variant_id          = NULLIF((p_copy->>'variant_id'), '')
  WHERE id = p_sent_email_id AND user_id = p_user_id;

  RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_send_snapshot(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_send_snapshot(uuid, uuid, jsonb) TO service_role;
