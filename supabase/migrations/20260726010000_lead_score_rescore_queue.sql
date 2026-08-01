-- Phase 1: async rescore queue.
-- New signals and ICP changes enqueue a rescore rather than scoring inline.
-- A pg_cron job drains the queue by calling process-rescore-queue, matching the
-- existing scheduled-function convention. Additive only.

CREATE TABLE IF NOT EXISTS public.rescore_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id      uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  reason       text NOT NULL DEFAULT 'signal',
  status       text NOT NULL DEFAULT 'pending',
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

-- At most one pending row per lead, so repeated signals coalesce.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rescore_queue_pending_lead
  ON public.rescore_queue(lead_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_rescore_queue_status ON public.rescore_queue(status, enqueued_at);

ALTER TABLE public.rescore_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rescore_queue_select_own" ON public.rescore_queue
  FOR SELECT USING (auth.uid() = user_id);
-- Writes happen via SECURITY DEFINER triggers / the service role; no client insert policy.

-- Enqueue when a new signal event fires for a lead.
CREATE OR REPLACE FUNCTION public.enqueue_rescore_on_signal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.rescore_queue (user_id, lead_id, reason)
  VALUES (NEW.user_id, NEW.lead_id, 'signal')
  ON CONFLICT (lead_id) WHERE status = 'pending' DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rescore_on_signal ON public.signal_events;
CREATE TRIGGER trg_rescore_on_signal
  AFTER INSERT ON public.signal_events
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_rescore_on_signal();

-- Enqueue all of a user's leads when their ICP changes.
CREATE OR REPLACE FUNCTION public.enqueue_rescore_on_icp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.rescore_queue (user_id, lead_id, reason)
  SELECT l.user_id, l.id, 'icp_change'
  FROM public.leads l
  WHERE l.user_id = NEW.user_id
  ON CONFLICT (lead_id) WHERE status = 'pending' DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rescore_on_icp ON public.icp_profiles;
CREATE TRIGGER trg_rescore_on_icp
  AFTER UPDATE ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_rescore_on_icp();

-- Drain: called by pg_cron. Posts to the edge function, which claims a batch,
-- rescores each lead with the deterministic engine, and marks rows processed.
CREATE OR REPLACE FUNCTION public.trigger_rescore_queue()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  config_url  text;
  config_key  text;
  pending_ct  integer;
BEGIN
  SELECT count(*) INTO pending_ct FROM public.rescore_queue WHERE status = 'pending';
  IF pending_ct = 0 THEN RETURN; END IF;

  SELECT setting_value->>'supabase_url' INTO config_url FROM admin_settings WHERE setting_key = 'supabase_config';
  SELECT setting_value->>'supabase_anon_key' INTO config_key FROM admin_settings WHERE setting_key = 'supabase_config';
  IF config_url IS NULL THEN
    config_url := 'https://ghgfjnepvxvxrncmskys.supabase.co';
    config_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZqbmVwdnh2eHJuY21za3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTU2NjEsImV4cCI6MjA3NjU3MTY2MX0.5r_bFaQNwZZ-XTUloOdFWcAZl0JShMbXsc6y6lPWq4o';
  END IF;

  PERFORM net.http_post(
    url := config_url || '/functions/v1/process-rescore-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || config_key),
    body := jsonb_build_object('batch', 50)
  );
END;
$$;

-- Run every 5 minutes.
SELECT cron.schedule('process-rescore-queue', '*/5 * * * *',
  $cmd$ SELECT public.trigger_rescore_queue(); $cmd$);
