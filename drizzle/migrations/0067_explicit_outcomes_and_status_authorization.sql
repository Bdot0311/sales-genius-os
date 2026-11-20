DO $migration$ DECLARE definition text:=pg_get_functiondef('public.admin_get_lead_intelligence_outcomes()'::regprocedure); body text; BEGIN
body:=split_part(split_part(definition,'AS $function$',2),'$function$',1);
IF position('WITH guard AS (' IN body)=0 THEN RAISE EXCEPTION 'Outcome report changed'; END IF;
EXECUTE 'CREATE OR REPLACE FUNCTION public.admin_get_lead_intelligence_outcomes() RETURNS TABLE(dimension text,bucket text,leads bigint,emails_sent bigint,replies bigint) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $authorized$ BEGIN IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), ''admin'') THEN RAISE EXCEPTION ''Administrator access required'' USING ERRCODE=''42501''; END IF; RETURN QUERY ' || body || ' END; $authorized$';
END; $migration$;
DO $migration$ DECLARE definition text:=pg_get_functiondef('public.get_service_status()'::regprocedure); body text; BEGIN
body:=split_part(split_part(definition,'AS $function$',2),'$function$',1);
IF position('and a.user_id is null' IN body)=0 THEN RAISE EXCEPTION 'Status privacy filter changed'; END IF;
EXECUTE 'CREATE OR REPLACE FUNCTION public.get_service_status() RETURNS TABLE(category text,severity text,since timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $authorized$ BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION ''Sign-in required'' USING ERRCODE=''42501''; END IF; RETURN QUERY ' || body || '; END; $authorized$';
END; $migration$;
REVOKE ALL ON FUNCTION public.admin_get_lead_intelligence_outcomes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_get_lead_intelligence_outcomes() TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_service_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_service_status() TO authenticated,service_role;