-- Intent scoring layer: fields populated by score-lead after every enrichment.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS intent_score     integer,
  ADD COLUMN IF NOT EXISTS intent_label     text,
  ADD COLUMN IF NOT EXISTS intent_reasons   text[],
  ADD COLUMN IF NOT EXISTS recommended_angle text,
  ADD COLUMN IF NOT EXISTS signal_type      text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS signal_date      timestamptz;

-- Index for sorting/filtering by intent score and label
CREATE INDEX IF NOT EXISTS idx_leads_intent_score ON public.leads(intent_score);
CREATE INDEX IF NOT EXISTS idx_leads_intent_label ON public.leads(intent_label);
CREATE INDEX IF NOT EXISTS idx_leads_signal_type  ON public.leads(signal_type);
