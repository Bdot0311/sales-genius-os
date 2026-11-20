-- Outcome data layer, phase 6: backfill, and the honest limit on it.
--
-- What this cannot do. Phase 1 exists because lead_decisions is upserted per
-- lead and leads is mutable, so the decision and attributes in force when a
-- historical email went out are already gone. A backfill can only record what
-- is true NOW, which is the exact leakage the capture path was built to
-- prevent: features from after the send, against an outcome from before it.
--
-- So these rows are marked scorer_version = 'backfill' and excluded from
-- readiness and from the export by default. They are worth having for
-- describing the past -- how many sends, what outcomes, which labels -- and
-- they must never be trained on.

/*
 * capture_send_snapshot, with an optional scorer_version override.
 *
 * Replaces the three-argument version rather than overloading it: an optional
 * fourth parameter with a default keeps every existing caller -- send-email
 * and process-scheduled-emails, which pass three -- compiling and behaving
 * exactly as before, while the backfill can mark its own rows at insert.
 * Overloading instead would leave two bodies to keep in step.
 */
CREATE OR REPLACE FUNCTION public.capture_send_snapshot(
  p_sent_email_id uuid,
  p_user_id uuid,
  p_copy jsonb DEFAULT '{}'::jsonb,
  p_scorer_version text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $capture$
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
    -- The override wins when given, so a backfilled row is marked the moment
    -- it exists and never needs an update to an append-only table.
    COALESCE(p_scorer_version, d.provider_model, 'none')
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
$capture$;

-- The three-argument signature is gone, replaced by the four-argument one with
-- a default. Drop it so two bodies cannot drift apart.
DROP FUNCTION IF EXISTS public.capture_send_snapshot(uuid, uuid, jsonb);

REVOKE ALL ON FUNCTION public.capture_send_snapshot(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_send_snapshot(uuid, uuid, jsonb, text) TO service_role;

/*
 * The legacy triage_category mapped onto an outcome label.
 *
 * Mirrors labelFromTriage() in _shared/reply-labels.ts, and
 * src/lib/outcome-backfill.test.ts asserts the two agree for every input, so
 * the SQL used for the backfill and the TypeScript used by the classifier
 * cannot drift into disagreeing about what an old reply meant.
 *
 * soft_no becomes 'other', not a guess between interested_later and objection.
 * It genuinely covered both, and a wrong label is worse for training than an
 * honest unknown a human can correct.
 */
CREATE OR REPLACE FUNCTION public.outcome_label_from_triage(p_triage text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE btrim(lower(COALESCE(p_triage, '')))
    WHEN 'positive'     THEN 'positive'
    WHEN 'hard_no'      THEN 'not_interested'
    WHEN 'ooo'          THEN 'out_of_office'
    WHEN 'wrong_person' THEN 'wrong_person'
    WHEN 'info_request' THEN 'positive'
    WHEN 'soft_no'      THEN 'other'
    ELSE 'other'
  END;
$$;

/*
 * Snapshots for sends that happened before capture existed.
 *
 * Idempotent: a send that already has a snapshot is skipped, so this can be
 * run again after it is interrupted without writing a second row for anything.
 * Batched, because the first run covers the whole history of the account and a
 * single statement over all of it would hold one long transaction.
 *
 * captured_at is the send time, not now, so signal recency and the send-hour
 * features are computed against the moment of the send even though the feature
 * values themselves are current. That is the least misleading option: the
 * alternative is a captured_at that disagrees with the send it describes.
 */
CREATE OR REPLACE FUNCTION public.backfill_outcome_snapshots(p_limit int DEFAULT 500)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_done int := 0;
  v_send record;
  v_snapshot_id uuid;
BEGIN
  FOR v_send IN
    SELECT se.id, se.user_id
      FROM public.sent_emails se
     WHERE se.status = 'sent'
       AND se.sent_at IS NOT NULL
       AND se.lead_id IS NOT NULL
       AND se.snapshot_id IS NULL
     ORDER BY se.sent_at ASC
     LIMIT GREATEST(1, LEAST(p_limit, 5000))
  LOOP
    /*
     * Marked at insert, through capture_send_snapshot's own parameter, rather
     * than updated afterwards. The snapshot table is append-only by trigger,
     * and the only way to update a row would be to disable that trigger --
     * which takes an ACCESS EXCLUSIVE lock on the table per row and would
     * block every live capture for the length of the backfill. Writing the
     * marker at insert leaves append-only inviolate and takes no such lock.
     */
    v_snapshot_id := public.capture_send_snapshot(
      v_send.id, v_send.user_id, '{}'::jsonb, 'backfill');
    IF v_snapshot_id IS NOT NULL THEN
      v_done := v_done + 1;
    END IF;
  END LOOP;
  RETURN v_done;
END;
$$;

/*
 * Outcome labels for replies classified before phase 2.
 *
 * Reads triage_category out of detected_signals, which is where analyze-reply
 * has always stored it -- the dedicated column was never written. Only fills a
 * row that has no outcome_label, so a label a person already corrected is
 * never touched, and marks what it wrote so it can be told apart from a
 * classifier's own judgement.
 */
CREATE OR REPLACE FUNCTION public.backfill_reply_labels(p_limit int DEFAULT 1000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_done int;
BEGIN
  WITH candidates AS (
    SELECT id, detected_signals->>'triage_category' AS triage
      FROM public.reply_analysis
     WHERE outcome_label IS NULL
     ORDER BY analyzed_at ASC
     LIMIT GREATEST(1, LEAST(p_limit, 20000))
  )
  UPDATE public.reply_analysis ra
     SET outcome_label = public.outcome_label_from_triage(c.triage),
         -- No confidence: nothing measured one. A null sends the reply to a
         -- person to confirm, which is the right outcome for a guess made
         -- from a coarser label.
         label_confidence = NULL,
         classifier_version = 'backfill'
    FROM candidates c
   WHERE ra.id = c.id;
  GET DIAGNOSTICS v_done = ROW_COUNT;
  RETURN v_done;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_outcome_snapshots(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_reply_labels(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_outcome_snapshots(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.backfill_reply_labels(int) TO service_role;

/*
 * Keep backfilled rows out of anything that trains.
 *
 * A backfilled snapshot carries feature values from after its send, so
 * including it in the readiness count would overstate how much trainable data
 * exists, and including it in an export would teach a model from the future.
 * The view keeps the rows and adds a column saying what they are, so the past
 * is still describable; readiness and the export filter on it.
 */
/*
 * Dropped and recreated, not replaced. CREATE OR REPLACE VIEW can only append
 * columns at the end; adding is_backfilled beside the other snapshot columns
 * where it belongs changes the column order, which it refuses with "cannot
 * change name of view column". Nothing depends on the view -- the readiness
 * functions reference it by name, which is not a dependency -- so no CASCADE.
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
  'One first touch per lead per sequence with its outcome. Export only rows where is_final AND NOT is_backfilled.';

REVOKE ALL ON public.training_examples FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_examples TO service_role;

/*
 * Readiness counts only rows a model could actually be trained on, and reports
 * the backfilled ones separately so the history is still visible without
 * inflating the meter.
 */
CREATE OR REPLACE FUNCTION public.dataset_readiness()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH trainable AS (
    SELECT * FROM public.training_examples WHERE is_final AND NOT is_backfilled
  ),
  totals AS (
    SELECT
      count(*)                                           AS finalized,
      count(*) FILTER (WHERE outcome = 'positive')       AS positives,
      count(*) FILTER (WHERE outcome = 'negative_reply') AS negative_reply,
      count(*) FILTER (WHERE outcome = 'no_reply')       AS no_reply,
      count(*) FILTER (WHERE outcome = 'bounced')        AS bounced,
      count(*) FILTER (WHERE outcome = 'unsubscribed')   AS unsubscribed,
      COALESCE(sum(human_labelled), 0)                   AS human_labels,
      COALESCE(sum(labelled - human_labelled), 0)        AS claude_labels
    FROM trainable
  ),
  other AS (
    SELECT
      count(*) FILTER (WHERE NOT is_final)                     AS pending,
      count(*) FILTER (WHERE is_final AND is_backfilled)       AS backfilled
    FROM public.training_examples
  )
  SELECT jsonb_build_object(
    'readiness', jsonb_build_object(
      'finalized', t.finalized,
      'positives', t.positives,
      'target_examples', public.dataset_target_examples(),
      'target_positives', public.dataset_target_positives(),
      'ready', t.finalized >= public.dataset_target_examples()
           AND t.positives >= public.dataset_target_positives()
    ),
    'totals', jsonb_build_object(
      'finalized', t.finalized,
      'positives', t.positives,
      'positive_rate', CASE WHEN t.finalized = 0 THEN NULL
                            ELSE round(t.positives::numeric / t.finalized, 4) END,
      'negative_reply', t.negative_reply,
      'no_reply', t.no_reply,
      'bounced', t.bounced,
      'unsubscribed', t.unsubscribed,
      'claude_labels', t.claude_labels,
      'human_labels', t.human_labels,
      'pending', o.pending,
      -- Named so the page can say "and N historical rows that cannot be
      -- trained on" rather than silently dropping them.
      'backfilled', o.backfilled
    ),
    'per_user', COALESCE((
      SELECT jsonb_agg(u ORDER BY u->>'finalized' DESC)
      FROM (
        SELECT jsonb_build_object(
          'user_id', user_id,
          'finalized', count(*),
          'positives', count(*) FILTER (WHERE outcome = 'positive'),
          'positive_rate', round(count(*) FILTER (WHERE outcome = 'positive')::numeric / count(*), 4)
        ) AS u
        FROM trainable GROUP BY user_id
      ) s
    ), '[]'::jsonb),
    'breakdowns', (
      SELECT jsonb_object_agg(d.dim, COALESCE(b.rows, '[]'::jsonb))
      FROM (VALUES
        ('send_recommendation'), ('email_priority'), ('strongest_signal_type'),
        ('seniority'), ('company_size_band'), ('personalization_type')
      ) AS d(dim)
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'value', value, 'finalized', finalized,
          'positives', positives, 'positive_rate', positive_rate
        )) AS rows
        FROM public.dataset_breakdown(d.dim)
      ) b ON TRUE
    ),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'as_of', as_of, 'finalized', finalized, 'positives', positives,
        'positive_rate', positive_rate, 'pending', pending
      ) ORDER BY as_of)
      FROM public.dataset_stats WHERE user_id IS NULL
    ), '[]'::jsonb)
  )
  FROM totals t CROSS JOIN other o;
$$;

/* The breakdowns answer whether the scoring predicts a reply, so they must not
 * be computed from rows whose features were recorded after the outcome. */
CREATE OR REPLACE FUNCTION public.dataset_breakdown(p_dimension text)
RETURNS TABLE (value text, finalized bigint, positives bigint, positive_rate numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_dimension NOT IN (
    'send_recommendation', 'email_priority', 'strongest_signal_type',
    'seniority', 'company_size_band', 'personalization_type',
    'icp_fit', 'buying_intent', 'sent_by', 'source', 'tier'
  ) THEN
    RAISE EXCEPTION 'dataset_breakdown: % is not a reportable dimension', p_dimension;
  END IF;

  RETURN QUERY EXECUTE format($q$
    SELECT
      COALESCE(%1$I::text, 'unknown') AS value,
      count(*)                        AS finalized,
      count(*) FILTER (WHERE outcome = 'positive') AS positives,
      round(count(*) FILTER (WHERE outcome = 'positive')::numeric / count(*), 4) AS positive_rate
    FROM public.training_examples
    WHERE is_final AND NOT is_backfilled
    GROUP BY COALESCE(%1$I::text, 'unknown')
    ORDER BY count(*) DESC
  $q$, p_dimension);
END;
$$;

REVOKE ALL ON FUNCTION public.dataset_breakdown(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dataset_readiness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dataset_breakdown(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dataset_readiness() TO service_role;
