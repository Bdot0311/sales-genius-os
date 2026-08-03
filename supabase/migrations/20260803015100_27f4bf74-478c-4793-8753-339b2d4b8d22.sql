CREATE TABLE public.search_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_type TEXT NOT NULL DEFAULT 'lead_search',
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  results_count INTEGER NOT NULL DEFAULT 0,
  provider TEXT NOT NULL DEFAULT 'railway',
  provider_source TEXT,
  provider_total INTEGER,
  credits_charged INTEGER NOT NULL DEFAULT 0,
  credit_balance_after INTEGER,
  status TEXT NOT NULL DEFAULT 'started',
  error_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.search_usage_events TO authenticated;
GRANT ALL ON public.search_usage_events TO service_role;

ALTER TABLE public.search_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own search usage events"
  ON public.search_usage_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own search usage events"
  ON public.search_usage_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage search usage events"
  ON public.search_usage_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_search_usage_events_user_created
  ON public.search_usage_events (user_id, created_at DESC);

CREATE TRIGGER update_search_usage_events_updated_at
  BEFORE UPDATE ON public.search_usage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();