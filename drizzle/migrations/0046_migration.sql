CREATE OR REPLACE FUNCTION public.system_health_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Signs with the internal trigger secret; the edge function rejects the anon key.
  PERFORM public.deliverability_call_edge('system-health-alert', '{}'::jsonb);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'system_health_alert failed: %', SQLERRM;
END;
$fn$;