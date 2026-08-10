-- Auto-advance lead pipeline_stage based on outreach activity.
-- Terminal / manual stages are never overwritten.
CREATE OR REPLACE FUNCTION public.advance_lead_stage(_lead_id uuid, _target text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur text;
  manual text[] := ARRAY['qualified','not_interested','won','lost','meeting_booked'];
BEGIN
  IF _lead_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(pipeline_stage, 'new') INTO cur FROM public.leads WHERE id = _lead_id;
  IF cur IS NULL THEN RETURN; END IF;

  -- never regress out of manually-set / terminal stages
  IF cur = ANY(manual) AND _target <> 'meeting_booked' AND _target <> 'not_interested' THEN
    RETURN;
  END IF;

  IF _target = 'contacted' AND cur NOT IN ('new') THEN RETURN; END IF;
  IF _target = 'no_response' AND cur NOT IN ('contacted') THEN RETURN; END IF;
  IF _target = 'replied' AND cur NOT IN ('new','contacted','no_response') THEN RETURN; END IF;

  IF cur <> _target THEN
    UPDATE public.leads SET pipeline_stage = _target, updated_at = now() WHERE id = _lead_id;
  END IF;
END;
$$;

-- Sent emails: mark contacted, and replied when a reply lands on the email row
CREATE OR REPLACE FUNCTION public.trg_lead_stage_from_sent_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.replied_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.replied_at IS NULL) THEN
    PERFORM public.advance_lead_stage(NEW.lead_id, 'replied');
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.status,'') IN ('sent','delivered','opened','replied')
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.status,'') IS DISTINCT FROM COALESCE(NEW.status,'')) THEN
    PERFORM public.advance_lead_stage(NEW.lead_id, 'contacted');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_stage_from_sent_email ON public.sent_emails;
CREATE TRIGGER lead_stage_from_sent_email
AFTER INSERT OR UPDATE OF status, replied_at ON public.sent_emails
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_stage_from_sent_email();

-- Inbound replies
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

DROP TRIGGER IF EXISTS lead_stage_from_reply ON public.reply_threads;
CREATE TRIGGER lead_stage_from_reply
AFTER INSERT OR UPDATE OF classification ON public.reply_threads
FOR EACH ROW EXECUTE FUNCTION public.trg_lead_stage_from_reply();

-- Daily sweep: contacted leads with no reply for 7+ days become no_response
CREATE OR REPLACE FUNCTION public.sweep_lead_no_response()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  WITH candidates AS (
    SELECT l.id
    FROM public.leads l
    WHERE COALESCE(l.pipeline_stage,'new') = 'contacted'
      AND EXISTS (
        SELECT 1 FROM public.sent_emails se
        WHERE se.lead_id = l.id AND se.sent_at IS NOT NULL
          AND se.sent_at < now() - interval '7 days'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.sent_emails se2
        WHERE se2.lead_id = l.id
          AND (se2.replied_at IS NOT NULL OR se2.sent_at >= now() - interval '7 days')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.reply_threads rt WHERE rt.lead_id = l.id
      )
  )
  UPDATE public.leads l
  SET pipeline_stage = 'no_response', updated_at = now()
  FROM candidates c
  WHERE l.id = c.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

SELECT cron.unschedule('lead-stage-no-response-sweep')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lead-stage-no-response-sweep');

SELECT cron.schedule(
  'lead-stage-no-response-sweep',
  '20 6 * * *',
  $$SELECT public.sweep_lead_no_response();$$
);

-- Backfill existing leads that were already emailed
UPDATE public.leads l
SET pipeline_stage = 'contacted'
WHERE COALESCE(l.pipeline_stage,'new') = 'new'
  AND EXISTS (SELECT 1 FROM public.sent_emails se WHERE se.lead_id = l.id AND se.sent_at IS NOT NULL);

UPDATE public.leads l
SET pipeline_stage = 'replied'
WHERE COALESCE(l.pipeline_stage,'new') IN ('new','contacted','no_response')
  AND (
    EXISTS (SELECT 1 FROM public.reply_threads rt WHERE rt.lead_id = l.id)
    OR EXISTS (SELECT 1 FROM public.sent_emails se WHERE se.lead_id = l.id AND se.replied_at IS NOT NULL)
  );
