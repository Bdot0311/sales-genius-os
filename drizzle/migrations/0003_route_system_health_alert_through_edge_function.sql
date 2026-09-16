-- The old body enqueued mail through public.enqueue_email(), which no longer
-- exists after the move to managed sending; its exception handler swallowed the
-- failure, so operators silently stopped receiving health alerts. The check and
-- the email now live in the system-health-alert edge function.
CREATE OR REPLACE FUNCTION public.system_health_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT value INTO v_url FROM public.deliverability_settings WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.deliverability_settings WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING 'system_health_alert: edge settings missing; skipped';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/system-health-alert',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
    body := '{}'::jsonb
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'system_health_alert failed: %', SQLERRM;
END;
$fn$;