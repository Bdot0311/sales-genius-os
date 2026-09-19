-- Lead Intelligence (structured decision layer).
-- One row per lead holds the latest evaluation; every attempt is logged in
-- lead_decision_events so latency/failure/distribution analytics never depend
-- on the latest-row being overwritten.

CREATE TABLE IF NOT EXISTS public.lead_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'jev',
  provider_model text,
  status text NOT NULL DEFAULT 'ok',            -- ok | unavailable
  error_message text,

  icp_fit text,
  icp_fit_confidence numeric,
  buying_intent text,
  buying_intent_confidence numeric,
  email_priority text,
  email_priority_confidence numeric,
  send_recommendation text,
  send_recommendation_confidence numeric,
  personalization_depth text,
  personalization_depth_confidence numeric,
  subject_strategy text,
  subject_strategy_confidence numeric,
  cta_strategy text,
  cta_strategy_confidence numeric,
  sequence_length text,
  sequence_length_confidence numeric,
  follow_up_timing text,
  follow_up_timing_confidence numeric,
  automation_review text,
  automation_review_confidence numeric,

  raw_response jsonb,
  input_snapshot jsonb,
  input_fingerprint text,
  campaign_id uuid,
  latency_ms integer,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lead_decisions_lead_id_key ON public.lead_decisions (lead_id);
CREATE INDEX IF NOT EXISTS lead_decisions_user_idx ON public.lead_decisions (user_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS lead_decisions_priority_idx ON public.lead_decisions (user_id, email_priority);

GRANT SELECT ON public.lead_decisions TO authenticated;
GRANT ALL ON public.lead_decisions TO service_role;

ALTER TABLE public.lead_decisions ENABLE ROW LEVEL SECURITY;

-- Reads are owner-scoped; writes happen only through the evaluation edge
-- function (service role), so no authenticated mutation policies exist.
DROP POLICY IF EXISTS "Users can view own lead decisions" ON public.lead_decisions;
CREATE POLICY "Users can view own lead decisions"
ON public.lead_decisions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages lead decisions" ON public.lead_decisions;
CREATE POLICY "Service role manages lead decisions"
ON public.lead_decisions FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Per-attempt observability. Raw provider payloads are NOT stored here; this is
-- metrics only, readable by admins.
CREATE TABLE IF NOT EXISTS public.lead_decision_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  lead_id uuid,
  provider text NOT NULL DEFAULT 'jev',
  provider_model text,
  status text NOT NULL,                        -- ok | error | skipped_cached | disabled
  error_kind text,                             -- timeout | malformed | rate_limit | http | unknown
  latency_ms integer,
  avg_confidence numeric,
  email_priority text,
  send_recommendation text,
  automation_review text,
  trigger_source text,                         -- manual | campaign | bulk
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_decision_events_created_idx ON public.lead_decision_events (created_at DESC);

GRANT SELECT ON public.lead_decision_events TO authenticated;
GRANT ALL ON public.lead_decision_events TO service_role;

ALTER TABLE public.lead_decision_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view decision events" ON public.lead_decision_events;
CREATE POLICY "Admins can view decision events"
ON public.lead_decision_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Service role manages decision events" ON public.lead_decision_events;
CREATE POLICY "Service role manages decision events"
ON public.lead_decision_events FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Admin metrics: volume, latency, failure rate, confidence, distributions.
CREATE OR REPLACE FUNCTION public.admin_get_lead_intelligence_stats(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  since timestamptz := now() - make_interval(days => greatest(coalesce(_days, 30), 1));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT jsonb_build_object(
    'evaluations', (SELECT count(*) FROM lead_decision_events WHERE created_at >= since),
    'failures', (SELECT count(*) FROM lead_decision_events WHERE created_at >= since AND status = 'error'),
    'cached_reuses', (SELECT count(*) FROM lead_decision_events WHERE created_at >= since AND status = 'skipped_cached'),
    'avg_latency_ms', (SELECT round(avg(latency_ms)) FROM lead_decision_events WHERE created_at >= since AND status = 'ok'),
    'p95_latency_ms', (SELECT round(percentile_disc(0.95) WITHIN GROUP (ORDER BY latency_ms)) FROM lead_decision_events WHERE created_at >= since AND status = 'ok' AND latency_ms IS NOT NULL),
    'avg_confidence', (SELECT round(avg(avg_confidence)::numeric, 3) FROM lead_decision_events WHERE created_at >= since AND status = 'ok'),
    'priority_distribution', (SELECT coalesce(jsonb_object_agg(email_priority, c), '{}'::jsonb) FROM (SELECT email_priority, count(*) c FROM lead_decisions WHERE email_priority IS NOT NULL GROUP BY 1) t),
    'send_distribution', (SELECT coalesce(jsonb_object_agg(send_recommendation, c), '{}'::jsonb) FROM (SELECT send_recommendation, count(*) c FROM lead_decisions WHERE send_recommendation IS NOT NULL GROUP BY 1) t),
    'review_distribution', (SELECT coalesce(jsonb_object_agg(automation_review, c), '{}'::jsonb) FROM (SELECT automation_review, count(*) c FROM lead_decisions WHERE automation_review IS NOT NULL GROUP BY 1) t),
    'icp_distribution', (SELECT coalesce(jsonb_object_agg(icp_fit, c), '{}'::jsonb) FROM (SELECT icp_fit, count(*) c FROM lead_decisions WHERE icp_fit IS NOT NULL GROUP BY 1) t),
    'intent_distribution', (SELECT coalesce(jsonb_object_agg(buying_intent, c), '{}'::jsonb) FROM (SELECT buying_intent, count(*) c FROM lead_decisions WHERE buying_intent IS NOT NULL GROUP BY 1) t),
    'error_kinds', (SELECT coalesce(jsonb_object_agg(coalesce(error_kind,'unknown'), c), '{}'::jsonb) FROM (SELECT error_kind, count(*) c FROM lead_decision_events WHERE created_at >= since AND status = 'error' GROUP BY 1) t)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_lead_intelligence_stats(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_lead_intelligence_stats(integer) TO authenticated;

-- Reply-rate outcomes by decision class, so we can tell whether the
-- recommendations actually improve results.
CREATE OR REPLACE FUNCTION public.admin_get_lead_intelligence_outcomes()
RETURNS TABLE (
  dimension text,
  bucket text,
  leads bigint,
  emails_sent bigint,
  replies bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH guard AS (
    SELECT CASE WHEN public.has_role(auth.uid(), 'admin') THEN true
                ELSE (SELECT null::boolean WHERE false) END AS ok
  ),
  sends AS (
    SELECT d.lead_id,
           d.icp_fit, d.buying_intent, d.personalization_depth, d.cta_strategy, d.subject_strategy,
           count(s.id) AS sent,
           count(s.id) FILTER (WHERE s.replied_at IS NOT NULL) AS replied
    FROM lead_decisions d
    LEFT JOIN sent_emails s ON s.lead_id = d.lead_id
    GROUP BY 1,2,3,4,5,6
  )
  SELECT dim.dimension, dim.bucket, count(*)::bigint, sum(sends.sent)::bigint, sum(sends.replied)::bigint
  FROM guard, sends
  CROSS JOIN LATERAL (
    VALUES ('icp_fit', sends.icp_fit),
           ('buying_intent', sends.buying_intent),
           ('personalization_depth', sends.personalization_depth),
           ('cta_strategy', sends.cta_strategy),
           ('subject_strategy', sends.subject_strategy)
  ) AS dim(dimension, bucket)
  WHERE guard.ok AND dim.bucket IS NOT NULL
  GROUP BY 1,2
  ORDER BY 1,2;
$$;

REVOKE ALL ON FUNCTION public.admin_get_lead_intelligence_outcomes() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_lead_intelligence_outcomes() TO authenticated;

-- Feature flag: lets the whole layer be switched off without removing code.
INSERT INTO public.feature_flags (name, description, is_enabled, rollout_percentage)
VALUES ('jevLeadIntelligence', 'Lead Intelligence: structured lead evaluation (ICP fit, intent, priority, email strategy).', true, 100)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES
  ('lead_decisions','lead_id','Lead Intelligence latest decision'),
  ('lead_decisions','icp_fit','Lead Intelligence latest decision'),
  ('lead_decisions','buying_intent','Lead Intelligence latest decision'),
  ('lead_decisions','email_priority','Lead Intelligence latest decision'),
  ('lead_decisions','send_recommendation','Lead Intelligence latest decision'),
  ('lead_decisions','personalization_depth','Lead Intelligence latest decision'),
  ('lead_decisions','subject_strategy','Lead Intelligence latest decision'),
  ('lead_decisions','cta_strategy','Lead Intelligence latest decision'),
  ('lead_decisions','sequence_length','Lead Intelligence latest decision'),
  ('lead_decisions','follow_up_timing','Lead Intelligence latest decision'),
  ('lead_decisions','automation_review','Lead Intelligence latest decision'),
  ('lead_decisions','input_fingerprint','Lead Intelligence freshness check'),
  ('lead_decision_events','status','Lead Intelligence observability')
ON CONFLICT DO NOTHING;
