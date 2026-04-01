-- Create enrichment history table
CREATE TABLE public.enrichment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  enriched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fields_enriched TEXT[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'apollo',
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  CONSTRAINT enrichment_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE public.enrichment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own enrichment history"
  ON public.enrichment_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own enrichment history"
  ON public.enrichment_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_enrichment_history_lead_id ON public.enrichment_history(lead_id);
CREATE INDEX idx_enrichment_history_user_id ON public.enrichment_history(user_id);