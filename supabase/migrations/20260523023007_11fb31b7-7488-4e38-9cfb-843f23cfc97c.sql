DO $$
BEGIN
  EXECUTE $func$
    CREATE OR REPLACE FUNCTION public.get_maintenance_status()
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $inner$
    BEGIN
      RETURN COALESCE((
        SELECT CASE
          WHEN setting_value = 'true'::jsonb  THEN true
          WHEN setting_value = 'false'::jsonb THEN false
          WHEN (setting_value->>'enabled') = 'true' THEN true
          ELSE false
        END
        FROM public.admin_settings
        WHERE setting_key = 'maintenance_mode'
        LIMIT 1
      ), false);
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    $inner$
  $func$;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'get_maintenance_status: skipped — %', SQLERRM;
END;
$$;

DO $$
BEGIN
  EXECUTE $func$
    GRANT EXECUTE ON FUNCTION public.get_maintenance_status() TO anon, authenticated
  $func$;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'grant get_maintenance_status: skipped — %', SQLERRM;
END;
$$;

DO $$
BEGIN
  EXECUTE $func$
    CREATE OR REPLACE FUNCTION public.get_maintenance_message()
    RETURNS text
    LANGUAGE plpgsql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $inner$
    BEGIN
      RETURN COALESCE((
        SELECT setting_value #>> '{}'
        FROM public.admin_settings
        WHERE setting_key = 'maintenance_message'
        LIMIT 1
      ), 'We''re performing scheduled maintenance. We''ll be back shortly.');
    EXCEPTION WHEN others THEN
      RETURN 'We''re performing scheduled maintenance. We''ll be back shortly.';
    END;
    $inner$
  $func$;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'get_maintenance_message: skipped — %', SQLERRM;
END;
$$;

DO $$
BEGIN
  EXECUTE $func$
    GRANT EXECUTE ON FUNCTION public.get_maintenance_message() TO anon, authenticated
  $func$;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'grant get_maintenance_message: skipped — %', SQLERRM;
END;
$$;