-- Create webhooks table
CREATE TABLE public.webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  events text[] NOT NULL,
  secret text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_triggered_at timestamp with time zone,
  total_triggers integer NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Elite users can view own webhooks"
  ON public.webhooks
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Elite users can create own webhooks"
  ON public.webhooks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Elite users can update own webhooks"
  ON public.webhooks
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Elite users can delete own webhooks"
  ON public.webhooks
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create team activity log table
CREATE TABLE public.team_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_owner_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.team_activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Team owners and members can view activity log"
  ON public.team_activity_log
  FOR SELECT
  USING (
    auth.uid() = team_owner_id OR 
    EXISTS (
      SELECT 1 FROM team_members 
      WHERE team_owner_id = team_activity_log.team_owner_id 
      AND member_user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can create activity log"
  ON public.team_activity_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Add rate limiting fields to api_keys table
ALTER TABLE public.api_keys
ADD COLUMN rate_limit_per_minute integer NOT NULL DEFAULT 60,
ADD COLUMN rate_limit_per_day integer NOT NULL DEFAULT 10000,
ADD COLUMN total_requests bigint NOT NULL DEFAULT 0,
ADD COLUMN last_request_at timestamp with time zone;

-- Create API usage tracking table
CREATE TABLE public.api_usage_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code integer,
  response_time_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Elite users can view own API usage"
  ON public.api_usage_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM api_keys 
      WHERE api_keys.id = api_usage_log.api_key_id 
      AND api_keys.user_id = auth.uid()
    )
  );

-- Create index for performance
CREATE INDEX idx_team_activity_log_team_owner ON team_activity_log(team_owner_id, created_at DESC);
CREATE INDEX idx_api_usage_log_api_key ON api_usage_log(api_key_id, created_at DESC);
CREATE INDEX idx_api_usage_log_created_at ON api_usage_log(created_at DESC);

-- Function to log team activity
CREATE OR REPLACE FUNCTION log_team_activity()
RETURNS TRIGGER AS $$
DECLARE
  team_owner uuid;
  action_type text;
BEGIN
  -- Determine action type
  IF TG_OP = 'INSERT' THEN
    action_type := 'created';
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'updated';
  ELSIF TG_OP = 'DELETE' THEN
    action_type := 'deleted';
  END IF;

  -- Get team owner (the user who owns the subscription)
  SELECT user_id INTO team_owner
  FROM subscriptions
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
  AND plan = 'elite'
  LIMIT 1;

  -- Only log if user has Elite plan
  IF team_owner IS NOT NULL THEN
    INSERT INTO team_activity_log (
      team_owner_id,
      user_id,
      action_type,
      entity_type,
      entity_id,
      details
    ) VALUES (
      team_owner,
      COALESCE(NEW.user_id, OLD.user_id),
      action_type,
      TG_TABLE_NAME,
      COALESCE(NEW.id, OLD.id),
      CASE
        WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
        ELSE to_jsonb(NEW)
      END
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers for activity logging
CREATE TRIGGER log_lead_activity
AFTER INSERT OR UPDATE OR DELETE ON leads
FOR EACH ROW
EXECUTE FUNCTION log_team_activity();

CREATE TRIGGER log_deal_activity
AFTER INSERT OR UPDATE OR DELETE ON deals
FOR EACH ROW
EXECUTE FUNCTION log_team_activity();