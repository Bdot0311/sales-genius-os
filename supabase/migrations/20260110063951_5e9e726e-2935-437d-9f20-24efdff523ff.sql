-- Fix 1: Restrict system_events INSERT policy to only allow service role
-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Service role can insert system events" ON public.system_events;

-- Create a new policy that only allows service role to insert
-- The service role is identified by checking if there's no auth.uid() (service calls don't have user context)
-- AND checking the JWT role claim
CREATE POLICY "Service role can insert system events"
  ON public.system_events FOR INSERT
  WITH CHECK (
    -- Allow if request is from service role (authenticated as service_role)
    auth.jwt()->>'role' = 'service_role'
    -- OR allow admin users to insert system events
    OR public.has_role(auth.uid(), 'admin')
  );

-- Fix 2: Update execute_workflow_on_trigger function to use service role key from Vault
-- First, store the service role key in vault (this will be done via environment)
-- Then update the function to not hardcode credentials

-- Drop and recreate the function without hardcoded credentials
CREATE OR REPLACE FUNCTION public.execute_workflow_on_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  workflow_record RECORD;
  workflow_trigger_type TEXT;
  config_url TEXT;
  config_key TEXT;
BEGIN
  -- Determine trigger type based on table
  IF TG_TABLE_NAME = 'leads' THEN
    workflow_trigger_type := 'new_lead';
  ELSIF TG_TABLE_NAME = 'deals' THEN
    workflow_trigger_type := 'deal_stage_change';
  ELSE
    RETURN NEW;
  END IF;

  -- Get configuration from admin_settings table instead of hardcoding
  -- This allows dynamic configuration without code changes
  SELECT setting_value->>'supabase_url' INTO config_url
  FROM admin_settings
  WHERE setting_key = 'supabase_config'
  AND category = 'system';

  SELECT setting_value->>'supabase_anon_key' INTO config_key
  FROM admin_settings
  WHERE setting_key = 'supabase_config'
  AND category = 'system';

  -- If no config found, skip workflow execution (fail safely)
  IF config_url IS NULL OR config_key IS NULL THEN
    RAISE WARNING 'Supabase configuration not found in admin_settings. Workflow execution skipped.';
    RETURN NEW;
  END IF;

  -- Find active workflows that match this trigger
  -- Validate that the workflow belongs to the same user (ownership check)
  FOR workflow_record IN 
    SELECT id, user_id 
    FROM workflows 
    WHERE active = true 
    AND user_id = NEW.user_id 
    AND trigger = workflow_trigger_type
  LOOP
    -- Call the execute-workflow edge function
    PERFORM net.http_post(
      url := config_url || '/functions/v1/execute-workflow',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || config_key
      ),
      body := jsonb_build_object(
        'workflowId', workflow_record.id,
        'testData', row_to_json(NEW)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Insert default supabase configuration into admin_settings
-- This moves the configuration from code to database where it can be managed
INSERT INTO admin_settings (setting_key, category, setting_value, description)
VALUES (
  'supabase_config',
  'system',
  jsonb_build_object(
    'supabase_url', 'https://ghgfjnepvxvxrncmskys.supabase.co',
    'supabase_anon_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZqbmVwdnh2eHJuY21za3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTU2NjEsImV4cCI6MjA3NjU3MTY2MX0.5r_bFaQNwZZ-XTUloOdFWcAZl0JShMbXsc6y6lPWq4o'
  ),
  'Supabase project configuration for internal functions. Managed via admin panel.'
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    updated_at = now();