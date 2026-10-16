CREATE OR REPLACE FUNCTION public.release_rescore_items(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  released integer := 0;
  r        record;
BEGIN
  FOR r IN
    SELECT id FROM public.rescore_queue
     WHERE id = ANY(p_ids) AND status = 'processing'
  LOOP
    BEGIN
      UPDATE public.rescore_queue
         SET status = 'pending', claimed_at = NULL, attempts = GREATEST(attempts - 1, 0)
       WHERE id = r.id AND status = 'processing';
      released := released + 1;
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM public.rescore_queue WHERE id = r.id AND status = 'processing';
    END;
  END LOOP;
  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_rescore_items(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rescore_items(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.release_stale_rescore_items()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  released integer := 0;
  r        record;
BEGIN
  FOR r IN
    SELECT id FROM public.rescore_queue
     WHERE status = 'processing'
       AND claimed_at < now() - interval '15 minutes'
       AND attempts < 3
  LOOP
    BEGIN
      UPDATE public.rescore_queue
         SET status = 'pending', claimed_at = NULL
       WHERE id = r.id
         AND status = 'processing'
         AND claimed_at < now() - interval '15 minutes'
         AND attempts < 3;
      released := released + (CASE WHEN FOUND THEN 1 ELSE 0 END);
    EXCEPTION WHEN unique_violation THEN
      DELETE FROM public.rescore_queue WHERE id = r.id AND status = 'processing';
    END;
  END LOOP;

  UPDATE public.rescore_queue
     SET status = 'error', processed_at = now()
   WHERE status = 'processing'
     AND claimed_at < now() - interval '15 minutes'
     AND attempts >= 3;

  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_stale_rescore_items() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_stale_rescore_items() TO service_role;

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
  PERFORM public.release_stale_rescore_items();

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