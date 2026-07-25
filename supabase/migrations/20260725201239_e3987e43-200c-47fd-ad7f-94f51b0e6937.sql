ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS intent_score integer,
  ADD COLUMN IF NOT EXISTS intent_label text,
  ADD COLUMN IF NOT EXISTS intent_reasons text[],
  ADD COLUMN IF NOT EXISTS recommended_angle text,
  ADD COLUMN IF NOT EXISTS signal_type text,
  ADD COLUMN IF NOT EXISTS signal_date timestamptz;