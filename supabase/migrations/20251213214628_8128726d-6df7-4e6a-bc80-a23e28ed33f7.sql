-- Create lead_scores table
CREATE TABLE public.lead_scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  icp_score INTEGER CHECK (icp_score >= 0 AND icp_score <= 100),
  intent_score INTEGER CHECK (intent_score >= 0 AND intent_score <= 100),
  enrichment_score INTEGER CHECK (enrichment_score >= 0 AND enrichment_score <= 100),
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  explanation TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own lead scores"
ON public.lead_scores
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own lead scores"
ON public.lead_scores
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own lead scores"
ON public.lead_scores
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own lead scores"
ON public.lead_scores
FOR DELETE
USING (auth.uid() = user_id);

-- Add indexes for faster lookups
CREATE INDEX idx_lead_scores_user_id ON public.lead_scores(user_id);
CREATE INDEX idx_lead_scores_contact_id ON public.lead_scores(contact_id);
CREATE INDEX idx_lead_scores_overall ON public.lead_scores(overall_score DESC);