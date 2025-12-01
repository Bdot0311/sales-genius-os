-- Fix search_path for the track_lead_score_change function
CREATE OR REPLACE FUNCTION public.track_lead_score_change()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.icp_score IS DISTINCT FROM NEW.icp_score THEN
    NEW.score_changed_at = now();
  END IF;
  RETURN NEW;
END;
$$;