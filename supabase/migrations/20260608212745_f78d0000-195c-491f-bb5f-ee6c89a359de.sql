
CREATE OR REPLACE FUNCTION public.admin_get_realtime_status()
RETURNS TABLE(
  table_name text,
  in_publication boolean,
  replica_identity text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  SELECT
    c.relname::text AS table_name,
    EXISTS (
      SELECT 1 FROM pg_publication_tables pt
      WHERE pt.pubname = 'supabase_realtime'
        AND pt.schemaname = 'public'
        AND pt.tablename = c.relname
    ) AS in_publication,
    CASE c.relreplident
      WHEN 'd' THEN 'default'
      WHEN 'n' THEN 'nothing'
      WHEN 'f' THEN 'full'
      WHEN 'i' THEN 'index'
      ELSE c.relreplident::text
    END AS replica_identity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY c.relname;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_realtime_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_realtime_heartbeat()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  INSERT INTO public.admin_settings (setting_key, setting_value, category, updated_by)
  VALUES ('realtime_heartbeat', to_jsonb(_now), 'system', auth.uid())
  ON CONFLICT (setting_key) DO UPDATE
    SET setting_value = EXCLUDED.setting_value,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  RETURN _now;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_realtime_heartbeat() TO authenticated;
