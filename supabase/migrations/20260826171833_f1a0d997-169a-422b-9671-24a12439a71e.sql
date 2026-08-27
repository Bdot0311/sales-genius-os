CREATE OR REPLACE FUNCTION public.trg_lead_stage_from_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cls text := lower(COALESCE(NEW.classification, ''));
  target text := 'replied';
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;

  IF cls LIKE '%ooo%' OR cls LIKE '%out_of_office%' OR cls LIKE '%out of office%'
     OR cls LIKE '%auto_reply%' OR cls LIKE '%autoreply%' OR cls LIKE '%vacation%' THEN
    RETURN NEW;
  END IF;

  IF cls LIKE '%meeting%' OR cls LIKE '%interested%' AND cls NOT LIKE '%not%' THEN
    target := 'meeting_booked';
  END IF;
  IF cls LIKE '%not_interested%' OR cls LIKE '%not interested%' OR cls LIKE '%unsubscrib%' THEN
    target := 'not_interested';
  END IF;

  PERFORM public.advance_lead_stage(NEW.lead_id, target);
  RETURN NEW;
END;
$$;