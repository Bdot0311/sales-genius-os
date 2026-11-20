ALTER TABLE public.reply_analysis
  ADD COLUMN IF NOT EXISTS outcome_label text,
  ADD COLUMN IF NOT EXISTS objection_type text,
  ADD COLUMN IF NOT EXISTS label_confidence numeric,
  ADD COLUMN IF NOT EXISTS classifier_version text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reply_analysis_outcome_label_check') THEN
    ALTER TABLE public.reply_analysis
      ADD CONSTRAINT reply_analysis_outcome_label_check
      CHECK (outcome_label IS NULL OR outcome_label IN (
        'positive','interested_later','referral','meeting_booked','objection',
        'not_interested','wrong_person','out_of_office','auto_reply',
        'unsubscribe_request','other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reply_analysis_low_confidence
  ON public.reply_analysis(user_id, label_confidence)
  WHERE outcome_label IS NOT NULL AND label_confidence < 0.7;

CREATE TABLE IF NOT EXISTS public.reply_label_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reply_analysis_id uuid NOT NULL REFERENCES public.reply_analysis(id) ON DELETE CASCADE,
  sent_email_id uuid REFERENCES public.sent_emails(id) ON DELETE SET NULL,
  outcome_label text NOT NULL CHECK (outcome_label IN (
    'positive','interested_later','referral','meeting_booked','objection',
    'not_interested','wrong_person','out_of_office','auto_reply',
    'unsubscribe_request','other')),
  objection_type text,
  note text,
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('user','agent')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rlo_analysis ON public.reply_label_overrides(reply_analysis_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rlo_user ON public.reply_label_overrides(user_id);

GRANT SELECT, INSERT ON public.reply_label_overrides TO authenticated;
GRANT ALL ON public.reply_label_overrides TO service_role;

ALTER TABLE public.reply_label_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own label overrides" ON public.reply_label_overrides;
CREATE POLICY "Users can view own label overrides"
  ON public.reply_label_overrides FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can correct labels on their own replies" ON public.reply_label_overrides;
CREATE POLICY "Users can correct labels on their own replies"
  ON public.reply_label_overrides FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (
    SELECT 1 FROM public.reply_analysis ra WHERE ra.id = reply_analysis_id AND ra.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.reply_label_overrides_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'reply_label_overrides is append-only (attempted %)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_rlo_immutable ON public.reply_label_overrides;
CREATE TRIGGER trg_rlo_immutable BEFORE UPDATE OR DELETE ON public.reply_label_overrides
  FOR EACH ROW EXECUTE FUNCTION public.reply_label_overrides_immutable();

CREATE OR REPLACE VIEW public.reply_labels_resolved WITH (security_invoker = true) AS
SELECT ra.id AS reply_analysis_id, ra.user_id, ra.sent_email_id, ra.lead_id,
  COALESCE(ovr.outcome_label, ra.outcome_label) AS label,
  COALESCE(ovr.objection_type, ra.objection_type) AS objection_type,
  CASE WHEN ovr.id IS NULL THEN 'claude' ELSE ovr.source END AS labeled_by,
  CASE WHEN ovr.id IS NULL THEN ra.label_confidence ELSE 1 END AS confidence,
  ra.classifier_version,
  COALESCE(ovr.created_at, ra.analyzed_at) AS labeled_at
FROM public.reply_analysis ra
LEFT JOIN LATERAL (
  SELECT o.id, o.outcome_label, o.objection_type, o.source, o.created_at
  FROM public.reply_label_overrides o WHERE o.reply_analysis_id = ra.id
  ORDER BY o.created_at DESC, o.id DESC LIMIT 1) ovr ON TRUE
WHERE ra.outcome_label IS NOT NULL OR ovr.id IS NOT NULL;

GRANT SELECT ON public.reply_labels_resolved TO authenticated;
GRANT SELECT ON public.reply_labels_resolved TO service_role;