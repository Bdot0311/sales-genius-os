
CREATE OR REPLACE FUNCTION public.admin_get_cron_runs(jobnames text[])
RETURNS TABLE(jobname text, last_success timestamptz, last_run timestamptz, last_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT
    j.jobname::text,
    max(d.start_time) FILTER (WHERE d.status = 'succeeded') AS last_success,
    max(d.start_time) AS last_run,
    (array_agg(d.status ORDER BY d.start_time DESC))[1]::text AS last_status
  FROM cron.job j
  LEFT JOIN cron.job_run_details d ON d.jobid = j.jobid
  WHERE j.jobname = ANY(jobnames)
    AND public.has_role(auth.uid(), 'admin'::app_role)
  GROUP BY j.jobname;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_cron_runs(text[]) TO authenticated;
