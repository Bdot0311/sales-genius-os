-- Allow any authenticated or anonymous user to check maintenance status.
-- Uses SECURITY DEFINER so the RLS policy on admin_settings is bypassed.
CREATE OR REPLACE FUNCTION public.get_maintenance_status()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN setting_value = 'true'::jsonb  THEN true
    WHEN setting_value = 'false'::jsonb THEN false
    WHEN (setting_value->>'enabled') = 'true' THEN true
    ELSE false
  END
  FROM admin_settings
  WHERE setting_key = 'maintenance_mode'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_status() TO anon, authenticated;

-- Also expose the maintenance message so the UI can display it
CREATE OR REPLACE FUNCTION public.get_maintenance_message()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT setting_value::text FROM admin_settings WHERE setting_key = 'maintenance_message' LIMIT 1),
    '"We''re performing scheduled maintenance. We''ll be back shortly."'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_message() TO anon, authenticated;
