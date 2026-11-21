/*
 * Phase 5 of the outcome data layer: consent, and the gate that enforces it.
 *
 * The capture phases record what happened to each outbound email so the
 * scoring can be trained on real outcomes. The drafted wording in
 * docs/DATA_USE_WORDING.md promises that this use happens only where the
 * customer agreed, and that withdrawing stops it. Until this migration there
 * was nothing to agree to and nothing to withdraw, which is why that wording
 * says it must not be published yet.
 *
 * Consent is tri-state on purpose. NULL means nobody has been asked, and it is
 * never read as a yes: every existing customer is asked as well as every new
 * one, so an account that predates the prompt contributes nothing until its
 * owner answers. There is no default and no pre-selected button.
 *
 * Capture is not gated. The snapshots are bands and counts with no message
 * text and no contact details, and they also feed the customer's own
 * reporting, which they are not being asked to give up. What consent controls
 * is the cross-customer training use, and that is enforced in one place: the
 * training_examples view, which every export and every readiness count reads.
 */

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS outcome_consent boolean,
  ADD COLUMN IF NOT EXISTS outcome_consent_decided_at timestamptz;

COMMENT ON COLUMN public.profiles.outcome_consent IS
  'Tri-state: NULL = not yet asked (never treated as yes), true = agreed, false = declined.';
COMMENT ON COLUMN public.profiles.outcome_consent_decided_at IS
  'When the owner last answered. NULL while outcome_consent is NULL.';

/*
 * Every answer is kept, because "you can withdraw at any time" is a promise
 * that has to be evidenced later. The current flag says what is true now; this
 * says what was answered and when. Append-only: no UPDATE or DELETE policy and
 * a trigger that refuses both, the same shape as lead_feature_snapshots.
 */
CREATE TABLE IF NOT EXISTS public.outcome_consent_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent     boolean NOT NULL,
  decided_at  timestamptz NOT NULL DEFAULT now(),
  -- Where the answer came from: the one-time prompt or the Settings row.
  source      text NOT NULL DEFAULT 'prompt',
  CONSTRAINT outcome_consent_log_source_check CHECK (source IN ('prompt', 'settings'))
);

CREATE INDEX IF NOT EXISTS outcome_consent_log_user_idx
  ON public.outcome_consent_log (user_id, decided_at DESC);

ALTER TABLE public.outcome_consent_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their own consent history" ON public.outcome_consent_log;
CREATE POLICY "Owners read their own consent history"
  ON public.outcome_consent_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.outcome_consent_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'outcome_consent_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_outcome_consent_log_immutable ON public.outcome_consent_log;
CREATE TRIGGER trg_outcome_consent_log_immutable
  BEFORE UPDATE OR DELETE ON public.outcome_consent_log
  FOR EACH ROW EXECUTE FUNCTION public.outcome_consent_log_immutable();

REVOKE ALL ON TABLE public.outcome_consent_log FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.outcome_consent_log TO authenticated;
GRANT SELECT, INSERT ON TABLE public.outcome_consent_log TO service_role;

/*
 * One call records an answer: the flag the product reads and the history that
 * evidences it, in one transaction, so a crash can never leave a flag with no
 * record behind it. Service-only — the answer arrives through the
 * outcome-consent function, which verifies the caller's token first, so the
 * browser never writes the flag directly.
 */
CREATE OR REPLACE FUNCTION public.set_outcome_consent(
  p_user_id uuid,
  p_consent boolean,
  p_source  text DEFAULT 'prompt'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decided_at timestamptz := now();
BEGIN
  IF p_user_id IS NULL OR p_consent IS NULL THEN
    RAISE EXCEPTION 'set_outcome_consent needs a user and an explicit answer';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('prompt', 'settings') THEN
    RAISE EXCEPTION 'set_outcome_consent source must be prompt or settings';
  END IF;

  UPDATE public.profiles
     SET outcome_consent = p_consent,
         outcome_consent_decided_at = v_decided_at,
         updated_at = v_decided_at
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no profile for %', p_user_id;
  END IF;

  INSERT INTO public.outcome_consent_log (user_id, consent, decided_at, source)
  VALUES (p_user_id, p_consent, v_decided_at, p_source);

  RETURN jsonb_build_object('consent', p_consent, 'decided_at', v_decided_at);
END;
$$;

REVOKE ALL ON FUNCTION public.set_outcome_consent(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_outcome_consent(uuid, boolean, text) TO service_role;

/*
 * Reading it back. A function rather than a select, for the same reason the
 * write is one: src/integrations/supabase/types.ts is regenerated from the
 * live database, so a column added by an unpublished migration does not exist
 * as far as the typed client is concerned, and a select on it fails the schema
 * check. A function call does not name the column outside the database.
 */
CREATE OR REPLACE FUNCTION public.outcome_consent_state(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    -- NULL stays NULL here. "Not asked" is a state the app shows differently
    -- from "no", so it must not be flattened into false on the way out.
    'consent',    p.outcome_consent,
    'decided_at', p.outcome_consent_decided_at
  )
  FROM public.profiles p
  WHERE p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.outcome_consent_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outcome_consent_state(uuid) TO service_role;

/*
 * The gate. training_examples is what every export and every readiness count
 * reads, so filtering here is the single place consent is enforced: a consumer
 * added later inherits it without having to remember it. The column list is
 * unchanged; the only difference is the join.
 *
 * NULL does not pass. IS TRUE, not "IS NOT FALSE", is the whole point of the
 * tri-state.
 */
DROP VIEW IF EXISTS public.training_examples;

CREATE VIEW public.training_examples
WITH (security_invoker = true) AS
WITH groups AS (
  SELECT
    se.user_id, se.lead_id, se.sequence_id,
    min(se.sent_at) AS first_sent_at,
    max(se.sent_at) AS last_sent_at,
    count(*)        AS touches,
    array_agg(se.id) AS send_ids
  FROM public.sent_emails se
  WHERE se.status = 'sent' AND se.sent_at IS NOT NULL AND se.lead_id IS NOT NULL
  GROUP BY se.user_id, se.lead_id, se.sequence_id
),
first_touch AS (
  SELECT DISTINCT ON (se.user_id, se.lead_id, se.sequence_id)
    se.id AS send_id, se.user_id, se.lead_id, se.sequence_id, se.enrollment_id,
    se.snapshot_id, se.sent_at, se.send_hour_local, se.send_weekday, se.variant_id,
    se.subject_word_count, se.body_word_count, se.has_question_cta, se.has_link,
    se.personalization_type, se.quality_checker_score,
    se.ai_generated, se.user_edited, se.edit_ratio, se.sent_by, se.agent_tier
  FROM public.sent_emails se
  WHERE se.status = 'sent' AND se.sent_at IS NOT NULL AND se.lead_id IS NOT NULL
    AND se.snapshot_id IS NOT NULL
    AND (se.sequence_step IS NULL OR se.sequence_step = 1)
  ORDER BY se.user_id, se.lead_id, se.sequence_id, se.sent_at ASC
)
SELECT
  ft.send_id, ft.user_id, ft.lead_id, ft.sequence_id, ft.enrollment_id,
  ft.snapshot_id, ft.sent_at, g.touches, g.last_sent_at,

  s.icp_fit, s.icp_fit_confidence, s.buying_intent, s.buying_intent_confidence,
  s.email_priority, s.send_recommendation, s.send_recommendation_confidence,
  s.fit_score, s.intent_score, s.signal_score,
  s.seniority, s.department, s.company_size_band, s.industry, s.country,
  s.email_verification_status, s.source, s.tier,
  s.signal_types, s.strongest_signal_type, s.signal_recency_days, s.signal_count,
  s.scorer, s.scorer_version,

  -- Features recorded after the send, so describable but not trainable.
  (s.scorer_version = 'backfill') AS is_backfilled,

  ft.send_hour_local, ft.send_weekday, ft.variant_id,
  ft.subject_word_count, ft.body_word_count, ft.has_question_cta, ft.has_link,
  ft.personalization_type, ft.quality_checker_score,
  ft.ai_generated, ft.user_edited, ft.edit_ratio, ft.sent_by, ft.agent_tier,

  CASE
    WHEN ev.bounced     THEN 'bounced'
    WHEN ev.unsubscribed THEN 'unsubscribed'
    WHEN ev.positives > 0 THEN 'positive'
    WHEN ev.human_replies > 0 THEN 'negative_reply'
    ELSE 'no_reply'
  END AS outcome,

  ev.positives, ev.human_replies, ev.labelled, ev.human_labelled, ev.unlabelled_replies,

  (
    ev.bounced OR ev.unsubscribed OR ev.human_replies > 0
    OR COALESCE(enr.status, '') IN ('completed', 'stopped')
    OR g.last_sent_at < now() - make_interval(days => public.outcome_silence_days())
  ) AS is_final

FROM first_touch ft
JOIN groups g
  ON g.user_id = ft.user_id AND g.lead_id = ft.lead_id
 AND g.sequence_id IS NOT DISTINCT FROM ft.sequence_id
-- Consent, enforced once for every consumer of this view.
JOIN public.profiles consenting
  ON consenting.id = ft.user_id AND consenting.outcome_consent IS TRUE
JOIN public.lead_feature_snapshots s ON s.id = ft.snapshot_id
LEFT JOIN public.sequence_enrollments enr ON enr.id = ft.enrollment_id
LEFT JOIN LATERAL (
  SELECT
    COALESCE(bool_or(b.sent_email_id IS NOT NULL), false) AS bounced,
    COALESCE(bool_or(o.email IS NOT NULL), false)         AS unsubscribed,
    count(*) FILTER (WHERE r.label IN ('positive','interested_later','referral','meeting_booked')) AS positives,
    count(*) FILTER (WHERE r.label IS NOT NULL AND r.label NOT IN ('out_of_office','auto_reply')) AS human_replies,
    count(r.label)                                        AS labelled,
    count(*) FILTER (WHERE r.labeled_by IN ('user','agent')) AS human_labelled,
    count(*) FILTER (WHERE ra.id IS NOT NULL AND r.label IS NULL) AS unlabelled_replies
  FROM unnest(g.send_ids) AS gs(send_id)
  LEFT JOIN public.reply_analysis ra ON ra.sent_email_id = gs.send_id
  LEFT JOIN public.reply_labels_resolved r ON r.reply_analysis_id = ra.id
  LEFT JOIN public.bounce_events b ON b.sent_email_id = gs.send_id AND b.bounce_type IN ('hard','block')
  LEFT JOIN public.sent_emails se2 ON se2.id = gs.send_id
  LEFT JOIN public.email_optouts o ON o.user_id = se2.user_id AND lower(o.email) = lower(se2.to_email)
) ev ON TRUE;

COMMENT ON VIEW public.training_examples IS
  'One first touch per lead per sequence with its outcome, for owners who agreed to the training use. Export only rows where is_final AND NOT is_backfilled.';

REVOKE ALL ON public.training_examples FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_examples TO service_role;

/*
 * What the gate withholds, so a readiness meter that reads zero says why
 * instead of looking broken. Counts only: no row from a non-consenting owner
 * is returned anywhere by this.
 */
CREATE OR REPLACE FUNCTION public.outcome_consent_summary()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH owners AS (
    SELECT
      count(*) FILTER (WHERE outcome_consent IS TRUE)  AS agreed,
      count(*) FILTER (WHERE outcome_consent IS FALSE) AS declined,
      count(*) FILTER (WHERE outcome_consent IS NULL)  AS not_asked
    FROM public.profiles
  ),
  withheld AS (
    SELECT count(*) AS first_touches
    FROM public.sent_emails se
    JOIN public.profiles p ON p.id = se.user_id
    WHERE se.status = 'sent' AND se.sent_at IS NOT NULL AND se.lead_id IS NOT NULL
      AND se.snapshot_id IS NOT NULL
      AND (se.sequence_step IS NULL OR se.sequence_step = 1)
      AND p.outcome_consent IS NOT TRUE
  )
  SELECT jsonb_build_object(
    'agreed',             owners.agreed,
    'declined',           owners.declined,
    'not_asked',          owners.not_asked,
    'withheld_sends',     withheld.first_touches
  )
  FROM owners, withheld;
$$;

REVOKE ALL ON FUNCTION public.outcome_consent_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.outcome_consent_summary() TO service_role;
