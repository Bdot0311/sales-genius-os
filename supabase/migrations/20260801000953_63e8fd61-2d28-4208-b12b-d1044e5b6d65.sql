-- ============ 20260726000000_lead_score_v2.sql ============
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fit_score        integer,
  ADD COLUMN IF NOT EXISTS tier             text,
  ADD COLUMN IF NOT EXISTS score_reason     text,
  ADD COLUMN IF NOT EXISTS scored_at        timestamptz,
  ADD COLUMN IF NOT EXISTS score_breakdown  jsonb DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_tier_check') THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_tier_check CHECK (tier IS NULL OR tier IN ('A','B','C')) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_tier ON public.leads(tier);
CREATE INDEX IF NOT EXISTS idx_leads_scored_at ON public.leads(scored_at);

CREATE TABLE IF NOT EXISTS public.signal_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id     uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  signal_type text NOT NULL,
  source      text,
  weight      integer NOT NULL DEFAULT 20,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signal_events_lead_id ON public.signal_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_signal_events_user_occurred ON public.signal_events(user_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_events TO authenticated;
GRANT ALL ON public.signal_events TO service_role;

ALTER TABLE public.signal_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signal_events_select_own" ON public.signal_events;
CREATE POLICY "signal_events_select_own" ON public.signal_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "signal_events_insert_own" ON public.signal_events;
CREATE POLICY "signal_events_insert_own" ON public.signal_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "signal_events_update_own" ON public.signal_events;
CREATE POLICY "signal_events_update_own" ON public.signal_events
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "signal_events_delete_own" ON public.signal_events;
CREATE POLICY "signal_events_delete_own" ON public.signal_events
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.scoring_rubric (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  weights    jsonb NOT NULL DEFAULT '{
    "fit": {"industry": 30, "headcount": 20, "seniority": 20, "function": 15, "geography": 10, "tech": 5},
    "intent": {"base_signal": 20, "recency_half_life_days": 14, "count_weight": 10, "repeat_account_bonus": 15},
    "thresholds": {"a_fit_min": 70, "b_fit_min": 40}
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scoring_rubric TO authenticated;
GRANT ALL ON public.scoring_rubric TO service_role;

ALTER TABLE public.scoring_rubric ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scoring_rubric_select_own" ON public.scoring_rubric;
CREATE POLICY "scoring_rubric_select_own" ON public.scoring_rubric
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "scoring_rubric_insert_own" ON public.scoring_rubric;
CREATE POLICY "scoring_rubric_insert_own" ON public.scoring_rubric
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "scoring_rubric_update_own" ON public.scoring_rubric;
CREATE POLICY "scoring_rubric_update_own" ON public.scoring_rubric
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "scoring_rubric_delete_own" ON public.scoring_rubric;
CREATE POLICY "scoring_rubric_delete_own" ON public.scoring_rubric
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_scoring_rubric_updated_at ON public.scoring_rubric;
CREATE TRIGGER update_scoring_rubric_updated_at
  BEFORE UPDATE ON public.scoring_rubric
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 20260726010000_lead_score_rescore_queue.sql ============
CREATE TABLE IF NOT EXISTS public.rescore_queue (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id      uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  reason       text NOT NULL DEFAULT 'signal',
  status       text NOT NULL DEFAULT 'pending',
  enqueued_at  timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rescore_queue_pending_lead
  ON public.rescore_queue(lead_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_rescore_queue_status ON public.rescore_queue(status, enqueued_at);

GRANT SELECT ON public.rescore_queue TO authenticated;
GRANT ALL ON public.rescore_queue TO service_role;

ALTER TABLE public.rescore_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rescore_queue_select_own" ON public.rescore_queue;
CREATE POLICY "rescore_queue_select_own" ON public.rescore_queue
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

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

CREATE OR REPLACE FUNCTION public.trigger_rescore_queue()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  config_url  text;
  config_key  text;
  pending_ct  integer;
BEGIN
  SELECT count(*) INTO pending_ct FROM public.rescore_queue WHERE status = 'pending';
  IF pending_ct = 0 THEN RETURN; END IF;

  SELECT setting_value->>'supabase_url', setting_value->>'supabase_anon_key'
    INTO config_url, config_key
    FROM admin_settings WHERE setting_key = 'supabase_config';

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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-rescore-queue') THEN
    PERFORM cron.unschedule('process-rescore-queue');
  END IF;
END $$;

SELECT cron.schedule('process-rescore-queue', '*/5 * * * *',
  $cmd$ SELECT public.trigger_rescore_queue(); $cmd$);
