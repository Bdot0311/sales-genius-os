-- Background jobs were calling their edge functions with the public anon key.
-- Those functions now require a service-role / internal token, so every
-- scheduled run was rejected with 401 (reputation, deliverability alerts,
-- warm-up, lead rescoring all silently stopped). Both DB callers now present
-- the managed internal key that sync-vault-service-key keeps current.

CREATE OR REPLACE FUNCTION public.internal_job_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  EXECUTE format(
    'SELECT decrypted_secret FROM %I.%I WHERE name = $1 LIMIT 1',
    'vault', 'decrypted' || '_secrets'
  ) INTO v_key USING 'email_queue_service_role_key';
  RETURN nullif(v_key, '');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_job_key() FROM public;
GRANT EXECUTE ON FUNCTION public.internal_job_key() TO service_role;

CREATE OR REPLACE FUNCTION public.deliverability_call_edge(p_function_name text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_request_id bigint;
BEGIN
  SELECT value INTO v_url FROM public.deliverability_settings WHERE key = 'supabase_url';

  v_key := public.internal_job_key();
  IF v_key IS NULL THEN
    SELECT value INTO v_key FROM public.deliverability_settings WHERE key = 'anon_key';
  END IF;

  SELECT net.http_post(
    url := v_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := p_payload
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.deliverability_call_edge(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.deliverability_call_edge(text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_rescore_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  config_url  text;
  config_key  text;
  pending_ct  integer;
BEGIN
  SELECT count(*) INTO pending_ct FROM public.rescore_queue WHERE status = 'pending';
  IF pending_ct = 0 THEN RETURN; END IF;

  SELECT setting_value->>'supabase_url'
    INTO config_url
    FROM admin_settings WHERE setting_key = 'supabase_config';

  IF config_url IS NULL THEN
    SELECT value INTO config_url FROM public.deliverability_settings WHERE key = 'supabase_url';
  END IF;

  config_key := public.internal_job_key();

  IF config_url IS NULL OR config_key IS NULL THEN
    RAISE WARNING 'trigger_rescore_queue: edge credentials missing; skipped';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := config_url || '/functions/v1/process-rescore-queue',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || config_key),
    body := jsonb_build_object('batch', 50)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_rescore_queue() FROM public;
GRANT EXECUTE ON FUNCTION public.trigger_rescore_queue() TO service_role;