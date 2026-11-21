REVOKE ALL ON FUNCTION public.admin_upsert_vault_secret(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_vault_secret(text, text) TO service_role;

DO $migration$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'dispatch-webhooks-every-min';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_job_id, command := $job$
      SELECT net.http_post(
        url := public.edge_base_url() || '/dispatch-webhooks',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || public.internal_job_key()
        ),
        body := '{}'::jsonb
      );
    $job$);
  END IF;
END;
$migration$;