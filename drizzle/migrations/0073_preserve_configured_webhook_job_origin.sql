DO $migration$
DECLARE
  v_job_id bigint;
  v_base_url text;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'dispatch-webhooks-every-min';
  IF v_job_id IS NOT NULL THEN
    SELECT substring(command FROM 'https://[^''[:space:]]+/functions/v1/') INTO v_base_url
    FROM cron.job
    WHERE jobname <> 'dispatch-webhooks-every-min'
      AND command LIKE '%/functions/v1/%'
    ORDER BY jobid
    LIMIT 1;
    IF v_base_url IS NULL THEN
      RAISE EXCEPTION 'Configured edge function address unavailable';
    END IF;
    PERFORM cron.alter_job(v_job_id, command := format($job$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || public.internal_job_key()
        ),
        body := '{}'::jsonb
      );
    $job$, v_base_url || 'dispatch-webhooks'));
  END IF;
END;
$migration$;