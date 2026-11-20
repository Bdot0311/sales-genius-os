DO $migration$ DECLARE definition text:=pg_get_functiondef('public.billing_downgrade_to_free(uuid,text,jsonb)'::regprocedure); BEGIN
IF position('WHERE s.user_id = _user_id;' IN definition)=0 OR position('IF _plan IS NULL THEN' IN definition)=0 THEN RAISE EXCEPTION 'Downgrade helper changed'; END IF;
definition:=replace(definition,'WHERE s.user_id = _user_id;','WHERE s.user_id = _user_id FOR UPDATE;');
definition:=replace(definition,'IF _plan IS NULL THEN','IF _plan IS NULL OR _plan = ''free'' THEN');
EXECUTE definition;
END; $migration$;
DO $migration$ DECLARE definition text:=pg_get_functiondef('public.admin_get_billing_audit(text,text,integer,integer)'::regprocedure); old text:='WHERE a.action IN ('; BEGIN
IF position(old IN definition)=0 THEN RAISE EXCEPTION 'Billing audit predicate changed'; END IF;
EXECUTE replace(definition,old,$predicate$WHERE NOT (
 a.action = 'billing_downgrade_to_free'
 AND coalesce(a.metadata->>'trigger','') = 'reconciliation'
 AND coalesce(a.old_values->>'plan','') = 'free'
 AND coalesce(a.new_values->>'plan','') = 'free'
) AND a.action IN ($predicate$);
END; $migration$;