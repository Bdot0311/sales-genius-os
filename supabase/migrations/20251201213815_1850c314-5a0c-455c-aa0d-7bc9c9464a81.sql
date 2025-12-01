-- Add date tracking columns to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS score_changed_at TIMESTAMP WITH TIME ZONE;

-- Create index for date filters
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted_at ON public.leads(last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_leads_score_changed_at ON public.leads(score_changed_at);

-- Create trigger to track score changes
CREATE OR REPLACE FUNCTION public.track_lead_score_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.icp_score IS DISTINCT FROM NEW.icp_score THEN
    NEW.score_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_lead_score_change
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.track_lead_score_change();