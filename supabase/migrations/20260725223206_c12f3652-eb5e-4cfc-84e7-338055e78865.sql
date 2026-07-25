
CREATE TABLE public.calendar_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  integration_id UUID,
  direction TEXT NOT NULL CHECK (direction IN ('outbound','inbound')),
  action TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','error','retry','skipped')),
  attempt INT NOT NULL DEFAULT 1,
  http_status INT,
  google_event_id TEXT,
  activity_id UUID,
  error_code TEXT,
  error_message TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cal_sync_logs_user_created ON public.calendar_sync_logs (user_id, created_at DESC);
CREATE INDEX idx_cal_sync_logs_status ON public.calendar_sync_logs (status, created_at DESC);

GRANT SELECT ON public.calendar_sync_logs TO authenticated;
GRANT ALL ON public.calendar_sync_logs TO service_role;

ALTER TABLE public.calendar_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own calendar sync logs"
  ON public.calendar_sync_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
