CREATE OR REPLACE FUNCTION public.log_audit_trail()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  action_type text;
  old_data jsonb;
  new_data jsonb;
  owner_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type := 'created'; new_data := to_jsonb(NEW); old_data := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    action_type := 'updated'; new_data := to_jsonb(NEW); old_data := to_jsonb(OLD);
  ELSE
    action_type := 'deleted'; new_data := NULL; old_data := to_jsonb(OLD);
  END IF;

  -- Tables name their owner differently (team_members uses team_owner_id);
  -- reading through jsonb avoids "record new has no field user_id".
  owner_id := COALESCE(
    new_data->>'user_id', old_data->>'user_id',
    new_data->>'team_owner_id', old_data->>'team_owner_id'
  )::uuid;

  IF owner_id IS NOT NULL THEN
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, metadata)
    VALUES (
      owner_id, action_type, TG_TABLE_NAME,
      COALESCE(new_data->>'id', old_data->>'id')::uuid,
      old_data, new_data,
      jsonb_build_object('table', TG_TABLE_NAME, 'operation', TG_OP)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;