-- Create table for saved lead search presets
CREATE TABLE public.lead_search_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_search_presets ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create own presets"
ON public.lead_search_presets
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own presets"
ON public.lead_search_presets
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own presets"
ON public.lead_search_presets
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own presets"
ON public.lead_search_presets
FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_lead_search_presets_updated_at
BEFORE UPDATE ON public.lead_search_presets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();