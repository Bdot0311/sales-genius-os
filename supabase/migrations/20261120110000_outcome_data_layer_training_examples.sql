-- Outcome data layer, phase 3: one row per first touch, with its outcome.
--
-- Reads only what phases 1 and 2 write. No model, no scoring.

/*
 * dataset_stats: one row per day, so progress toward a trainable dataset is a
 * trend rather than a number that only exists while someone is looking at it.
 * user_id NULL is the account-wide total for that day.
 */
CREATE TABLE IF NOT EXISTS public.dataset_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of date NOT NULL DEFAULT CURRENT_DATE,
  user_id uuid,
  finalized int NOT NULL DEFAULT 0,
  positives int NOT NULL DEFAULT 0,
  -- Stored rather than derived so a day's rate survives even if the rows
  -- behind it are later deleted with their lead.
  positive_rate numeric,
  no_reply int NOT NULL DEFAULT 0,
  negative_reply int NOT NULL DEFAULT 0,
  bounced int NOT NULL DEFAULT 0,
  unsubscribed int NOT NULL DEFAULT 0,
  -- How many labels a person set rather than the classifier. A dataset whose
  -- labels are all machine-made is worth less than one a human has corrected.
  claude_labels int NOT NULL DEFAULT 0,
  human_labels int NOT NULL DEFAULT 0,
  pending int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dataset_stats IS
  'Daily snapshot of training-set progress. One row per user per day, plus a user_id IS NULL account-wide row.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_dataset_stats_day_user
  ON public.dataset_stats(as_of, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.dataset_stats ENABLE ROW LEVEL SECURITY;

-- A user may read their own day rows. The account-wide rows (user_id IS NULL)
-- are founder-only and reached through the admin function, not this policy.
DROP POLICY IF EXISTS "Users can view own dataset stats" ON public.dataset_stats;
CREATE POLICY "Users can view own dataset stats"
  ON public.dataset_stats FOR SELECT USING (auth.uid() = user_id);

/*
 * How long after the last touch a silent lead counts as decided.
 *
 * An enrollment that has reached a terminal status is decided already; this is
 * the fallback for a lead that was never enrolled, or whose sequence is still
 * nominally active with nothing left to send.
 */
CREATE OR REPLACE FUNCTION public.outcome_silence_days() RETURNS int
LANGUAGE sql IMMUTABLE AS $$ SELECT 21 $$;

/*
 * One row per first touch, with the outcome of the whole sequence that touch
 * began.
 *
 * A first touch is sequence_step 1, or a send with no step at all -- a one-off
 * manual email is a first touch even though it is not part of a sequence. Only
 * sends that carry a snapshot appear: a send with no snapshot has no features
 * to train on, so it is not an example, and counting it would only make the
 * dataset look bigger than it is.
 *
 * Grouped by (user, lead, sequence), with a NULL sequence meaning standalone,
 * and the earliest send in each group is the first touch. Outcomes roll up
 * across every send in that group, because a reply to touch four is still the
 * result of the sequence touch one started.
 */
CREATE OR REPLACE VIEW public.training_examples
WITH (security_invoker = true) AS
WITH groups AS (
  SELECT
    se.user_id,
    se.lead_id,
    se.sequence_id,
    min(se.sent_at)                         AS first_sent_at,
    max(se.sent_at)                         AS last_sent_at,
    count(*)                                AS touches,
    array_agg(se.id)                        AS send_ids
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
    -- Belt and braces: the inner join to lead_feature_snapshots below already
    -- drops a send with no snapshot. Stated here too so the intent is readable
    -- where the rows are chosen rather than inferred from a join three
    -- clauses later.
    AND se.snapshot_id IS NOT NULL
    AND (se.sequence_step IS NULL OR se.sequence_step = 1)
  ORDER BY se.user_id, se.lead_id, se.sequence_id, se.sent_at ASC
)
SELECT
  ft.send_id,
  ft.user_id,
  ft.lead_id,
  ft.sequence_id,
  ft.enrollment_id,
  ft.snapshot_id,
  ft.sent_at,
  g.touches,
  g.last_sent_at,

  -- Features, as they were at the send.
  s.icp_fit, s.icp_fit_confidence, s.buying_intent, s.buying_intent_confidence,
  s.email_priority, s.send_recommendation, s.send_recommendation_confidence,
  s.fit_score, s.intent_score, s.signal_score,
  s.seniority, s.department, s.company_size_band, s.industry, s.country,
  s.email_verification_status, s.source, s.tier,
  s.signal_types, s.strongest_signal_type, s.signal_recency_days, s.signal_count,
  s.scorer, s.scorer_version,

  ft.send_hour_local, ft.send_weekday, ft.variant_id,
  ft.subject_word_count, ft.body_word_count, ft.has_question_cta, ft.has_link,
  ft.personalization_type, ft.quality_checker_score,
  ft.ai_generated, ft.user_edited, ft.edit_ratio, ft.sent_by, ft.agent_tier,

  /*
   * Outcome, strongest signal first. A bounce or an unsubscribe is what
   * happened to the send regardless of anything else; among replies a win
   * beats a loss, because one positive reply is the result that matters.
   * Out-of-office and auto-reply are neither: they are the absence of an
   * answer, and counting them as negatives would teach a model that a good
   * email caused them.
   */
  CASE
    WHEN ev.bounced     THEN 'bounced'
    WHEN ev.unsubscribed THEN 'unsubscribed'
    WHEN ev.positives > 0 THEN 'positive'
    WHEN ev.human_replies > 0 THEN 'negative_reply'
    ELSE 'no_reply'
  END AS outcome,

  ev.positives,
  ev.human_replies,
  ev.labelled,
  ev.human_labelled,
  ev.unlabelled_replies,

  /*
   * Decided, and so safe to train on. A terminal event settles it at once; so
   * does an enrollment that stopped. Otherwise the lead has to have been quiet
   * for outcome_silence_days since the last touch -- a silence that is still
   * running is not yet a no_reply, and exporting it as one would label a
   * pending conversation as a failure.
   */
  (
    ev.bounced OR ev.unsubscribed OR ev.human_replies > 0
    -- COALESCE: most sends have no enrollment, and `NULL IN (...)` is NULL,
    -- which poisons the whole OR chain -- is_final came out NULL rather than
    -- false for every undecided example. `WHERE is_final` still excluded them,
    -- so an export was right by accident, but `NOT is_final` excluded them
    -- too and the pending count read 0 with two conversations open.
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
    /*
     * COALESCE, because bool_or over no matching rows is NULL, not false, and
     * NULL propagates: is_final came out NULL for every undecided example
     * rather than false. `WHERE is_final` still excluded them, so exports were
     * right by luck, but `NOT is_final` excluded them too -- the pending count
     * read 0 while two conversations were open.
     */
    COALESCE(bool_or(b.sent_email_id IS NOT NULL), false)                  AS bounced,
    COALESCE(bool_or(o.email IS NOT NULL), false)                          AS unsubscribed,
    count(*) FILTER (WHERE r.label IN ('positive','interested_later','referral','meeting_booked')) AS positives,
    -- A human reply is any label that is not an away message. 'other' counts:
    -- somebody wrote back, even if the classifier could not say what it was.
    count(*) FILTER (WHERE r.label IS NOT NULL AND r.label NOT IN ('out_of_office','auto_reply')) AS human_replies,
    count(r.label)                                                         AS labelled,
    count(*) FILTER (WHERE r.labeled_by IN ('user','agent'))               AS human_labelled,
    -- Replies that arrived but carry no label yet: the reason an example can
    -- be unfinalised even after someone wrote back.
    count(*) FILTER (WHERE ra.id IS NOT NULL AND r.label IS NULL)           AS unlabelled_replies
  FROM unnest(g.send_ids) AS gs(send_id)
  LEFT JOIN public.reply_analysis ra ON ra.sent_email_id = gs.send_id
  LEFT JOIN public.reply_labels_resolved r ON r.reply_analysis_id = ra.id
  LEFT JOIN public.bounce_events b ON b.sent_email_id = gs.send_id AND b.bounce_type IN ('hard','block')
  LEFT JOIN public.sent_emails se2 ON se2.id = gs.send_id
  LEFT JOIN public.email_optouts o ON o.user_id = se2.user_id AND lower(o.email) = lower(se2.to_email)
) ev ON TRUE;

COMMENT ON VIEW public.training_examples IS
  'One row per first touch with the sequence outcome rolled up. Export only rows where is_final.';

/*
 * The nightly job.
 *
 * There is nothing to "mark" final: is_final is derived in the view, so it is
 * correct the moment the clock passes it and cannot drift from the rows it
 * describes. What the job does is record the day's counts, which a view cannot
 * do for itself.
 */
CREATE OR REPLACE FUNCTION public.record_dataset_stats(p_as_of date DEFAULT CURRENT_DATE)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows int;
BEGIN
  INSERT INTO public.dataset_stats (
    as_of, user_id, finalized, positives, positive_rate,
    no_reply, negative_reply, bounced, unsubscribed,
    claude_labels, human_labels, pending
  )
  SELECT
    p_as_of,
    g.user_id,
    count(*) FILTER (WHERE t.is_final),
    count(*) FILTER (WHERE t.is_final AND t.outcome = 'positive'),
    CASE WHEN count(*) FILTER (WHERE t.is_final) = 0 THEN NULL
         ELSE round(
           count(*) FILTER (WHERE t.is_final AND t.outcome = 'positive')::numeric
           / count(*) FILTER (WHERE t.is_final), 4) END,
    count(*) FILTER (WHERE t.is_final AND t.outcome = 'no_reply'),
    count(*) FILTER (WHERE t.is_final AND t.outcome = 'negative_reply'),
    count(*) FILTER (WHERE t.is_final AND t.outcome = 'bounced'),
    count(*) FILTER (WHERE t.is_final AND t.outcome = 'unsubscribed'),
    COALESCE(sum(t.labelled - t.human_labelled) FILTER (WHERE t.is_final), 0),
    COALESCE(sum(t.human_labelled) FILTER (WHERE t.is_final), 0),
    count(*) FILTER (WHERE NOT t.is_final)
  FROM public.training_examples t
  -- GROUPING SETS so the account-wide row is counted from the same scan as the
  -- per-user rows and cannot disagree with their sum.
  CROSS JOIN LATERAL (SELECT t.user_id) g(user_id)
  GROUP BY GROUPING SETS ((g.user_id), ())
  ON CONFLICT (as_of, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  DO UPDATE SET
    finalized = EXCLUDED.finalized,
    positives = EXCLUDED.positives,
    positive_rate = EXCLUDED.positive_rate,
    no_reply = EXCLUDED.no_reply,
    negative_reply = EXCLUDED.negative_reply,
    bounced = EXCLUDED.bounced,
    unsubscribed = EXCLUDED.unsubscribed,
    claude_labels = EXCLUDED.claude_labels,
    human_labels = EXCLUDED.human_labels,
    pending = EXCLUDED.pending;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

/*
 * dataset_stats is readable by its owner, filtered by the policy above, so a
 * user can see their own progress. training_examples is not: it is the export
 * surface and carries per-lead features, so it stays with service_role and the
 * founder-only function that reads it.
 */
GRANT SELECT ON TABLE public.dataset_stats TO authenticated;
GRANT ALL ON TABLE public.dataset_stats TO service_role;
REVOKE ALL ON public.training_examples FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.training_examples TO service_role;

REVOKE ALL ON FUNCTION public.record_dataset_stats(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_dataset_stats(date) TO service_role;

/*
 * The nightly run, scheduled the way agent_missions schedules its dispatcher:
 * pg_cron calling the SQL function directly.
 *
 * No edge function and no net.http_post, because nothing here leaves the
 * database. That also keeps an anon JWT out of this migration, which the
 * http_post-based schedules in this repo have to embed.
 *
 * 03:14 UTC: after midnight in every timezone this product sells into, so a
 * day's row is written once the day's sends are actually done, and off the hour
 * where every other scheduled job is queued.
 *
 * Wrapped because a database without pg_cron -- a local postgres, the audit job
 * -- must not fail the whole migration over a schedule it cannot keep.
 */
DO $$
BEGIN
  PERFORM cron.schedule(
    'record-dataset-stats',
    '14 3 * * *',
    $cmd$ SELECT public.record_dataset_stats(); $cmd$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'record-dataset-stats not scheduled: %', SQLERRM;
END $$;
