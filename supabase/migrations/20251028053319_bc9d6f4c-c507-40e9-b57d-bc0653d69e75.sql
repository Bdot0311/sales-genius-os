-- Fix security warning: Set search_path for the workflow trigger function
CREATE OR REPLACE FUNCTION public.execute_workflow_on_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  workflow_record RECORD;
  workflow_trigger_type TEXT;
  supabase_url TEXT := 'https://ghgfjnepvxvxrncmskys.supabase.co';
  supabase_anon_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZqbmVwdnh2eHJuY21za3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTU2NjEsImV4cCI6MjA3NjU3MTY2MX0.5r_bFaQNwZZ-XTUloOdFWcAZl0JShMbXsc6y6lPWq4o';
BEGIN
  -- Determine trigger type based on table
  IF TG_TABLE_NAME = 'leads' THEN
    workflow_trigger_type := 'new_lead';
  ELSIF TG_TABLE_NAME = 'deals' THEN
    workflow_trigger_type := 'deal_stage_change';
  ELSE
    RETURN NEW;
  END IF;

  -- Find active workflows that match this trigger
  FOR workflow_record IN 
    SELECT id, user_id 
    FROM workflows 
    WHERE active = true 
    AND user_id = NEW.user_id 
    AND trigger = workflow_trigger_type
  LOOP
    -- Call the execute-workflow edge function
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/execute-workflow',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || supabase_anon_key
      ),
      body := jsonb_build_object(
        'workflowId', workflow_record.id,
        'testData', row_to_json(NEW)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;