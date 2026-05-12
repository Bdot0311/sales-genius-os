
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  last_error text,
  next_retry_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swe_status_next_retry
  ON public.stripe_webhook_events (status, next_retry_at)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_swe_created_at
  ON public.stripe_webhook_events (created_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Admins can view webhook events"
  ON public.stripe_webhook_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Admins can update webhook events"
  ON public.stripe_webhook_events FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_swe_updated_at ON public.stripe_webhook_events;
CREATE TRIGGER trg_swe_updated_at
  BEFORE UPDATE ON public.stripe_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
