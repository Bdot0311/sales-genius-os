ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_pipeline_stage_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_pipeline_stage_check
  CHECK (pipeline_stage IN (
    'new', 'contacted', 'no_response', 'replied', 'bounced',
    'meeting_booked', 'qualified', 'not_interested', 'won', 'lost'
  ));

CREATE OR REPLACE FUNCTION public.advance_lead_stage(_lead_id uuid, _target text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur text;
  terminal text[] := ARRAY['qualified','not_interested','won','lost','meeting_booked'];
  valid_targets text[] := ARRAY['new','contacted','no_response','replied','bounced','meeting_booked','qualified','not_interested','won','lost'];
BEGIN
  IF _lead_id IS NULL OR NOT (_target = ANY(valid_targets)) THEN RETURN; END IF;

  SELECT COALESCE(pipeline_stage, 'new') INTO cur
  FROM public.leads
  WHERE id = _lead_id;
  IF cur IS NULL THEN RETURN; END IF;

  -- Automated activity must not regress a manually chosen or terminal outcome.
  IF cur = ANY(terminal) AND _target NOT IN ('meeting_booked', 'not_interested') THEN RETURN; END IF;

  IF _target = 'contacted' AND cur <> 'new' THEN RETURN; END IF;
  IF _target = 'no_response' AND cur <> 'contacted' THEN RETURN; END IF;
  IF _target = 'replied' AND cur NOT IN ('new','contacted','no_response','bounced') THEN RETURN; END IF;
  IF _target = 'bounced' AND cur NOT IN ('new','contacted','no_response') THEN RETURN; END IF;

  IF cur <> _target THEN
    UPDATE public.leads
    SET pipeline_stage = _target, updated_at = now()
    WHERE id = _lead_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_lead_stage_from_reply_analysis()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cls text := lower(COALESCE(NEW.intent_classification, ''));
  signals jsonb := COALESCE(NEW.detected_signals, '{}'::jsonb);
  target text := 'replied';
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;

  IF COALESCE((signals ->> 'has_meeting_request')::boolean, false)
     OR cls LIKE '%meeting%' OR cls LIKE '%interested%' THEN
    target := 'meeting_booked';
  END IF;
  IF cls LIKE '%not_interested%' OR cls LIKE '%not interested%'
     OR cls LIKE '%unsubscribe%' OR cls LIKE '%negative%' THEN
    target := 'not_interested';
  END IF;

  PERFORM public.advance_lead_stage(NEW.lead_id, target);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_stage_from_reply_analysis ON public.reply_analysis;
CREATE TRIGGER lead_stage_from_reply_analysis
AFTER INSERT OR UPDATE OF intent_classification, detected_signals ON public.reply_analysis
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_stage_from_reply_analysis();

CREATE OR REPLACE FUNCTION public.trg_lead_stage_from_bounce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_lead_id uuid;
BEGIN
  SELECT lead_id INTO linked_lead_id
  FROM public.sent_emails
  WHERE id = NEW.sent_email_id;

  PERFORM public.advance_lead_stage(linked_lead_id, 'bounced');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_stage_from_bounce ON public.bounce_events;
CREATE TRIGGER lead_stage_from_bounce
AFTER INSERT ON public.bounce_events
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_stage_from_bounce();

-- Reconcile existing records, preserving manual/terminal outcomes.
UPDATE public.leads l
SET pipeline_stage = 'contacted', updated_at = now(), lead_status = 'active'
WHERE COALESCE(l.pipeline_stage, 'new') = 'new'
  AND EXISTS (
    SELECT 1 FROM public.sent_emails se
    WHERE se.lead_id = l.id
      AND se.status IN ('sent','delivered','opened','replied','bounced')
  );

UPDATE public.leads l
SET pipeline_stage = 'replied', updated_at = now(), lead_status = 'active'
WHERE COALESCE(l.pipeline_stage, 'new') IN ('new','contacted','no_response','bounced')
  AND (
    EXISTS (SELECT 1 FROM public.reply_threads rt WHERE rt.lead_id = l.id)
    OR EXISTS (SELECT 1 FROM public.reply_analysis ra WHERE ra.lead_id = l.id)
    OR EXISTS (SELECT 1 FROM public.sent_emails se WHERE se.lead_id = l.id AND se.replied_at IS NOT NULL)
  );

UPDATE public.leads l
SET pipeline_stage = 'bounced', updated_at = now(), lead_status = 'active'
WHERE COALESCE(l.pipeline_stage, 'new') IN ('new','contacted','no_response')
  AND EXISTS (
    SELECT 1
    FROM public.bounce_events be
    JOIN public.sent_emails se ON se.id = be.sent_email_id
    WHERE se.lead_id = l.id
  )
  AND NOT EXISTS (SELECT 1 FROM public.reply_threads rt WHERE rt.lead_id = l.id)
  AND NOT EXISTS (SELECT 1 FROM public.reply_analysis ra WHERE ra.lead_id = l.id);

INSERT INTO public.schema_contract (table_name, column_name, note)
VALUES ('leads', 'pipeline_stage', 'Saved Leads pipeline label and automatic outreach lifecycle state')
ON CONFLICT (table_name, column_name) DO UPDATE SET note = EXCLUDED.note;