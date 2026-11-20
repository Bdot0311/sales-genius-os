-- Outcome data layer, phase 4: is this dataset trainable yet, and does Lead
-- Intelligence predict anything?
--
-- Reads training_examples. Writes nothing.

/*
 * The threshold for training the first scoring model, as one definition.
 *
 * Two numbers, not one: 2,000 finished examples with fewer than 100 positives
 * is a dataset that mostly records silence, and a model trained on it learns to
 * predict "no" at every input. The positives are the scarce half.
 *
 * SQL functions rather than constants in the page, so the meter and any query
 * that reports against it cannot disagree about what "ready" means.
 */
CREATE OR REPLACE FUNCTION public.dataset_target_examples() RETURNS int
LANGUAGE sql IMMUTABLE AS $$ SELECT 2000 $$;

CREATE OR REPLACE FUNCTION public.dataset_target_positives() RETURNS int
LANGUAGE sql IMMUTABLE AS $$ SELECT 100 $$;

/*
 * Positive-reply rate by one feature of the send.
 *
 * This is the question the whole data layer exists to answer: if the positive
 * rate is flat across every band of send_recommendation, then Lead
 * Intelligence's recommendation predicts nothing yet and a model trained on it
 * would inherit that.
 *
 * Only finished examples count. A pending conversation has no outcome, and
 * including it would quietly depress every rate by the share of sends still in
 * flight.
 */
CREATE OR REPLACE FUNCTION public.dataset_breakdown(p_dimension text)
RETURNS TABLE (value text, finalized bigint, positives bigint, positive_rate numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- An allowlist, not string interpolation: this runs as definer, so a column
  -- name from a caller would be an injection point into the whole schema.
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
    WHERE is_final
    GROUP BY COALESCE(%1$I::text, 'unknown')
    ORDER BY count(*) DESC
  $q$, p_dimension);
END;
$$;

/*
 * Everything the founder page shows, in one call.
 *
 * Built in the database so the page cannot compute a rate one way while an
 * export computes it another, and so a growing dataset is aggregated where the
 * rows are rather than shipped to a browser to be counted.
 */
CREATE OR REPLACE FUNCTION public.dataset_readiness()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH final AS (
    SELECT * FROM public.training_examples WHERE is_final
  ),
  totals AS (
    SELECT
      count(*)                                                  AS finalized,
      count(*) FILTER (WHERE outcome = 'positive')              AS positives,
      count(*) FILTER (WHERE outcome = 'negative_reply')        AS negative_reply,
      count(*) FILTER (WHERE outcome = 'no_reply')              AS no_reply,
      count(*) FILTER (WHERE outcome = 'bounced')               AS bounced,
      count(*) FILTER (WHERE outcome = 'unsubscribed')          AS unsubscribed,
      COALESCE(sum(human_labelled), 0)                          AS human_labels,
      COALESCE(sum(labelled - human_labelled), 0)               AS claude_labels
    FROM final
  ),
  pending AS (
    SELECT count(*) AS pending FROM public.training_examples WHERE NOT is_final
  )
  SELECT jsonb_build_object(
    'readiness', jsonb_build_object(
      'finalized', t.finalized,
      'positives', t.positives,
      'target_examples', public.dataset_target_examples(),
      'target_positives', public.dataset_target_positives(),
      -- Both thresholds, because either alone is a misleading green light.
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
      'pending', p.pending
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
        FROM final GROUP BY user_id
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
  FROM totals t CROSS JOIN pending p;
$$;

REVOKE ALL ON FUNCTION public.dataset_breakdown(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dataset_readiness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dataset_breakdown(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dataset_readiness() TO service_role;
