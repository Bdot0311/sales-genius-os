-- Make a stalled visitor resolution visible instead of silent.
--
-- The Visitors overview showed a page view of 1 with both Identified and
-- Unknown at 0, and nothing to explain the gap. Every processed job writes a
-- match row -- visitor-resolve calls saveMatch unconditionally, whatever the
-- decision -- so zero rows means the job was never processed, not that
-- resolution looked and found nothing. The page could not say so because
-- visitor_resolve_jobs is granted to service_role only, which is correct: it
-- holds ip_raw.
--
-- This returns counts and timings for the caller's own jobs and nothing else.
-- No addresses, no hashes, no per-row detail, so it can be read by the browser
-- without widening access to the table itself.

CREATE OR REPLACE FUNCTION public.visitor_resolution_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'queued',  count(*) FILTER (WHERE status = 'queued'),
    'running', count(*) FILTER (WHERE status = 'running'),
    'failed',  count(*) FILTER (WHERE status = 'failed'),
    'done',    count(*) FILTER (WHERE status = 'done'),
    -- When resolution last actually completed something. Null with queued work
    -- waiting is the signature of a resolver that is not running at all, which
    -- is a different problem from one that runs and finds nothing.
    'last_finished_at', max(finished_at) FILTER (WHERE status = 'done'),
    'oldest_queued_at', min(created_at) FILTER (WHERE status IN ('queued', 'running')),
    -- The most recent error, so a resolver that is running and failing says why.
    -- Truncated: these come from upstream lookups and can be long.
    'last_error', (
      SELECT left(last_error, 300) FROM public.visitor_resolve_jobs
       WHERE user_id = auth.uid() AND status = 'failed' AND last_error IS NOT NULL
       ORDER BY finished_at DESC NULLS LAST LIMIT 1
    )
  )
  FROM public.visitor_resolve_jobs
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.visitor_resolution_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitor_resolution_status() TO authenticated, service_role;
