
-- Create a trigger function that calls the notify-new-signup edge function via pg_net
CREATE OR REPLACE FUNCTION public.notify_signup_via_edge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  config_url TEXT;
  config_key TEXT;
BEGIN
  -- Get Supabase URL and key from admin_settings
  SELECT setting_value->>'supabase_url' INTO config_url
  FROM admin_settings
  WHERE setting_key = 'supabase_config'
  AND category = 'system';

  SELECT setting_value->>'supabase_anon_key' INTO config_key
  FROM admin_settings
  WHERE setting_key = 'supabase_config'
  AND category = 'system';

  -- If no config, try environment-based approach
  IF config_url IS NULL THEN
    config_url := 'https://ghgfjnepvxvxrncmskys.supabase.co';
  END IF;
  IF config_key IS NULL THEN
    config_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZqbmVwdnh2eHJuY21za3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTU2NjEsImV4cCI6MjA3NjU3MTY2MX0.5r_bFaQNwZZ-XTUloOdFWcAZl0JShMbXsc6y6lPWq4o';
  END IF;

  PERFORM net.http_post(
    url := config_url || '/functions/v1/notify-new-signup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || config_key
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );

  RETURN NEW;
END;
$$;

-- Create the trigger on the profiles table (fires on every new signup)
DROP TRIGGER IF EXISTS on_new_signup_notify ON public.profiles;
CREATE TRIGGER on_new_signup_notify
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_signup_via_edge();
