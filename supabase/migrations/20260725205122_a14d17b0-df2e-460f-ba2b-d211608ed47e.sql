
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS signal_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signals text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS signal_layers jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS leads_signal_score_idx ON public.leads (user_id, signal_score DESC);
