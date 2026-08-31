-- Queue outbound webhook events from real activity
CREATE OR REPLACE FUNCTION public.enqueue_webhook_event(_user_id uuid, _event text, _payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
BEGIN
  IF _user_id IS NULL OR _event IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.webhook_deliveries (webhook_id, user_id, event, payload, status, direction)
  SELECT w.id, w.user_id, _event,
         jsonb_build_object('event', _event, 'data', _payload, 'timestamp', (extract(epoch from now()) * 1000)::bigint),
         'pending', 'outbound'
  FROM public.webhooks w
  WHERE w.user_id = _user_id
    AND w.is_active = true
    AND COALESCE(w.direction, 'outbound') = 'outbound'
    AND w.events @> ARRAY[_event]::text[];

  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_webhook_event(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_webhook_event(uuid, text, jsonb) TO service_role;

-- Lead events
CREATE OR REPLACE FUNCTION public.trg_webhooks_leads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_webhook_event(NEW.user_id, 'lead.created', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.enqueue_webhook_event(OLD.user_id, 'lead.deleted', jsonb_build_object('id', OLD.id, 'contact_email', OLD.contact_email, 'company_name', OLD.company_name));
    RETURN OLD;
  ELSE
    _payload := to_jsonb(NEW);
    IF COALESCE(OLD.pipeline_stage, '') <> COALESCE(NEW.pipeline_stage, '') THEN
      PERFORM public.enqueue_webhook_event(NEW.user_id, 'lead.stage_changed',
        _payload || jsonb_build_object('old_stage', OLD.pipeline_stage, 'new_stage', NEW.pipeline_stage));
    END IF;
    PERFORM public.enqueue_webhook_event(NEW.user_id, 'lead.updated', _payload);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS webhooks_leads_ins ON public.leads;
CREATE TRIGGER webhooks_leads_ins AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_webhooks_leads();

DROP TRIGGER IF EXISTS webhooks_leads_upd ON public.leads;
CREATE TRIGGER webhooks_leads_upd AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_webhooks_leads();

DROP TRIGGER IF EXISTS webhooks_leads_del ON public.leads;
CREATE TRIGGER webhooks_leads_del AFTER DELETE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.trg_webhooks_leads();

-- Deal events
CREATE OR REPLACE FUNCTION public.trg_webhooks_deals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.enqueue_webhook_event(NEW.user_id, 'deal.created', to_jsonb(NEW));
    RETURN NEW;
  END IF;

  _payload := to_jsonb(NEW);
  IF COALESCE(OLD.stage, '') <> COALESCE(NEW.stage, '') THEN
    PERFORM public.enqueue_webhook_event(NEW.user_id, 'deal.stage_changed',
      _payload || jsonb_build_object('old_stage', OLD.stage, 'new_stage', NEW.stage));
    IF NEW.stage IN ('closed_won', 'closed_lost') THEN
      PERFORM public.enqueue_webhook_event(NEW.user_id, 'deal.closed', _payload);
    END IF;
  END IF;
  PERFORM public.enqueue_webhook_event(NEW.user_id, 'deal.updated', _payload);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS webhooks_deals_ins ON public.deals;
CREATE TRIGGER webhooks_deals_ins AFTER INSERT ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.trg_webhooks_deals();

DROP TRIGGER IF EXISTS webhooks_deals_upd ON public.deals;
CREATE TRIGGER webhooks_deals_upd AFTER UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.trg_webhooks_deals();

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON public.webhook_deliveries (status, next_retry_at)
  WHERE status IN ('pending', 'failed');