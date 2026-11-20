-- Outcome data layer, phase 2: one label per reply, and a user correction that
-- cannot be undone by the classifier.
--
-- Why a separate column rather than reusing triage_category. reply_analysis
-- already carries triage_category (positive|soft_no|hard_no|ooo|wrong_person|
-- info_request), and the agent reads it to decide whether to draft a reply, set
-- requires_human_action and set check_back_at. Those six values are not a
-- subset of the labels we want to train on -- soft_no alone covers both
-- "interested later" and "objection" -- so widening it in place would change
-- agent behaviour, which this build is not allowed to do. The training label
-- lives beside it and the legacy field is untouched.

ALTER TABLE public.reply_analysis
  ADD COLUMN IF NOT EXISTS outcome_label text,
  ADD COLUMN IF NOT EXISTS objection_type text,
  ADD COLUMN IF NOT EXISTS label_confidence numeric,
  ADD COLUMN IF NOT EXISTS classifier_version text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reply_analysis_outcome_label_check'
  ) THEN
    ALTER TABLE public.reply_analysis
      ADD CONSTRAINT reply_analysis_outcome_label_check
      CHECK (outcome_label IS NULL OR outcome_label IN (
        'positive','interested_later','referral','meeting_booked','objection',
        'not_interested','wrong_person','out_of_office','auto_reply',
        'unsubscribe_request','other'
      ));
  END IF;
END $$;

-- Low-confidence rows are the ones the inbox asks a human to confirm.
CREATE INDEX IF NOT EXISTS idx_reply_analysis_low_confidence
  ON public.reply_analysis(user_id, label_confidence)
  WHERE outcome_label IS NOT NULL AND label_confidence < 0.7;

/*
 * User corrections live in their own append-only table, not in reply_analysis.
 *
 * analyze-reply updates the existing reply_analysis row when it recognises the
 * same gmail_message_id, so a correction written into that row would be
 * silently overwritten the next time the classifier ran over the same reply.
 * The user label is supposed to always win, and a row the classifier owns
 * cannot provide that. These rows are never updated or deleted, so the history
 * of who relabelled what survives, and the newest one wins.
 */
CREATE TABLE IF NOT EXISTS public.reply_label_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reply_analysis_id uuid NOT NULL REFERENCES public.reply_analysis(id) ON DELETE CASCADE,
  sent_email_id uuid REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  outcome_label text NOT NULL CHECK (outcome_label IN (
    'positive','interested_later','referral','meeting_booked','objection',
    'not_interested','wrong_person','out_of_office','auto_reply',
    'unsubscribe_request','other'
  )),
  objection_type text,
  note text,
  -- Who or what applied it. 'user' is a person in the inbox; 'agent' is an
  -- agent tool acting for them. Both outrank the classifier; the distinction
  -- matters when judging how gold a gold label really is.
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','agent')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reply_label_overrides IS
  'Append-only. A human (or an agent acting for them) correcting a classifier label. Newest row wins over reply_analysis.outcome_label.';

CREATE INDEX IF NOT EXISTS idx_rlo_analysis ON public.reply_label_overrides(reply_analysis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rlo_user ON public.reply_label_overrides(user_id);

ALTER TABLE public.reply_label_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own label overrides"
  ON public.reply_label_overrides FOR SELECT USING (auth.uid() = user_id);

-- A person correcting a label in their own inbox is an ordinary write, unlike
-- the snapshot rows: the whole point is that they can do it in one tap. The
-- analysis row must be one they own, so a forged id cannot relabel someone
-- else's reply.
CREATE POLICY "Users can correct labels on their own replies"
  ON public.reply_label_overrides FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.reply_analysis ra
       WHERE ra.id = reply_analysis_id AND ra.user_id = auth.uid()
    )
  );

-- No UPDATE or DELETE policy. A correction is a new row, so the trail of what
-- a label used to be is never rewritten.
CREATE OR REPLACE FUNCTION public.reply_label_overrides_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reply_label_overrides is append-only (attempted %)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_rlo_immutable ON public.reply_label_overrides;
CREATE TRIGGER trg_rlo_immutable
  BEFORE UPDATE OR DELETE ON public.reply_label_overrides
  FOR EACH ROW EXECUTE FUNCTION public.reply_label_overrides_immutable();

/*
 * The resolved label for every classified reply: the newest human correction
 * when there is one, otherwise the classifier's. labeled_by says which, so a
 * training export can weight gold labels and the admin page can report the
 * claude/user mix without recomputing this rule in two places.
 */
CREATE OR REPLACE VIEW public.reply_labels_resolved
WITH (security_invoker = true) AS
SELECT
  ra.id                       AS reply_analysis_id,
  ra.user_id,
  ra.sent_email_id,
  ra.lead_id,
  COALESCE(ovr.outcome_label, ra.outcome_label)   AS label,
  COALESCE(ovr.objection_type, ra.objection_type) AS objection_type,
  CASE WHEN ovr.id IS NULL THEN 'claude' ELSE ovr.source END AS labeled_by,
  -- A human label is certain by definition; only the classifier reports doubt.
  CASE WHEN ovr.id IS NULL THEN ra.label_confidence ELSE 1 END AS confidence,
  ra.classifier_version,
  COALESCE(ovr.created_at, ra.analyzed_at) AS labeled_at
FROM public.reply_analysis ra
LEFT JOIN LATERAL (
  SELECT o.id, o.outcome_label, o.objection_type, o.source, o.created_at
    FROM public.reply_label_overrides o
   WHERE o.reply_analysis_id = ra.id
   ORDER BY o.created_at DESC, o.id DESC
   LIMIT 1
) ovr ON TRUE
WHERE ra.outcome_label IS NOT NULL OR ovr.id IS NOT NULL;

COMMENT ON VIEW public.reply_labels_resolved IS
  'One label per classified reply: newest human correction wins over the classifier.';
