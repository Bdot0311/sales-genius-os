-- Create alert_rules table for custom alerting
CREATE TABLE public.alert_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  metric_type text NOT NULL, -- 'error_rate', 'response_time', 'request_volume', 'webhook_failure'
  threshold_value numeric NOT NULL,
  comparison_operator text NOT NULL, -- 'greater_than', 'less_than', 'equals'
  time_window_minutes integer NOT NULL DEFAULT 60,
  notification_channels text[] NOT NULL DEFAULT ARRAY['email'], -- 'email', 'webhook'
  notification_webhook_url text,
  is_active boolean NOT NULL DEFAULT true,
  last_triggered_at timestamp with time zone,
  trigger_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Elite users can view own alert rules"
  ON public.alert_rules
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Elite users can create own alert rules"
  ON public.alert_rules
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Elite users can update own alert rules"
  ON public.alert_rules
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Elite users can delete own alert rules"
  ON public.alert_rules
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create webhook_tests table for integration testing
CREATE TABLE public.webhook_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id uuid NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  test_name text NOT NULL,
  test_payload jsonb NOT NULL,
  expected_status_code integer,
  expected_response_contains text,
  validate_signature boolean NOT NULL DEFAULT true,
  test_result jsonb,
  passed boolean,
  last_run_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.webhook_tests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Elite users can view own webhook tests"
  ON public.webhook_tests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM webhooks 
      WHERE webhooks.id = webhook_tests.webhook_id 
      AND webhooks.user_id = auth.uid()
    )
  );

CREATE POLICY "Elite users can create webhook tests"
  ON public.webhook_tests
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM webhooks 
      WHERE webhooks.id = webhook_tests.webhook_id 
      AND webhooks.user_id = auth.uid()
    )
  );

CREATE POLICY "Elite users can update own webhook tests"
  ON public.webhook_tests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM webhooks 
      WHERE webhooks.id = webhook_tests.webhook_id 
      AND webhooks.user_id = auth.uid()
    )
  );

CREATE POLICY "Elite users can delete webhook tests"
  ON public.webhook_tests
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM webhooks 
      WHERE webhooks.id = webhook_tests.webhook_id 
      AND webhooks.user_id = auth.uid()
    )
  );

-- Add expiration and rotation fields to api_keys
ALTER TABLE public.api_keys
ADD COLUMN expires_at timestamp with time zone,
ADD COLUMN rotation_reminder_sent boolean NOT NULL DEFAULT false,
ADD COLUMN rotation_policy_days integer,
ADD COLUMN endpoint_rate_limits jsonb DEFAULT '{}'::jsonb,
ADD COLUMN enable_caching boolean NOT NULL DEFAULT false,
ADD COLUMN cache_ttl_seconds integer DEFAULT 300;

-- Create api_key_rotations table to track rotation history
CREATE TABLE public.api_key_rotations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  old_key_id uuid NOT NULL,
  new_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  rotation_reason text,
  rotated_by uuid NOT NULL,
  rotated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_key_rotations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Elite users can view own key rotations"
  ON public.api_key_rotations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM api_keys 
      WHERE api_keys.id = api_key_rotations.new_key_id 
      AND api_keys.user_id = auth.uid()
    )
  );

CREATE POLICY "Elite users can create key rotations"
  ON public.api_key_rotations
  FOR INSERT
  WITH CHECK (auth.uid() = rotated_by);

-- Add indexes for performance
CREATE INDEX idx_alert_rules_user_active ON alert_rules(user_id, is_active);
CREATE INDEX idx_webhook_tests_webhook ON webhook_tests(webhook_id);
CREATE INDEX idx_api_key_rotations_new_key ON api_key_rotations(new_key_id);
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_webhook_deliveries_webhook_status ON webhook_deliveries(webhook_id, status, created_at DESC);

-- Function to check for expiring API keys
CREATE OR REPLACE FUNCTION check_expiring_api_keys()
RETURNS void AS $$
DECLARE
  expiring_key RECORD;
BEGIN
  -- Find keys expiring in 7 days that haven't sent reminder
  FOR expiring_key IN 
    SELECT ak.id, ak.name, ak.user_id, ak.expires_at, p.email, p.full_name
    FROM api_keys ak
    JOIN profiles p ON p.id = ak.user_id
    WHERE ak.expires_at IS NOT NULL
    AND ak.expires_at <= now() + interval '7 days'
    AND ak.rotation_reminder_sent = false
    AND ak.is_active = true
  LOOP
    -- Mark reminder as sent
    UPDATE api_keys 
    SET rotation_reminder_sent = true 
    WHERE id = expiring_key.id;
    
    -- Note: Actual email sending would be done by an edge function
    -- This just marks the keys that need reminders
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;