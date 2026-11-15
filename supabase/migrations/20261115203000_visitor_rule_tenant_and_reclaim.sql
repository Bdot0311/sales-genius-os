-- A rule's site and its user must be the same workspace. Site ids are public,
-- and the service-role resolver used to load rules by site_id alone.
-- Also reclaim resolve jobs left in 'running' by a crashed worker.

CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_sites_id_user
  ON public.visitor_sites (id, user_id);

ALTER TABLE public.visitor_rules
  DROP CONSTRAINT IF EXISTS visitor_rules_site_user_fkey;

ALTER TABLE public.visitor_rules
  ADD CONSTRAINT visitor_rules_site_user_fkey
  FOREIGN KEY (site_id, user_id)
  REFERENCES public.visitor_sites (id, user_id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.claim_visitor_resolve_jobs(p_limit integer)
RETURNS SETOF public.visitor_resolve_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Three claims is enough. A job still running after that is failed rather
  -- than retried forever, and its raw address is dropped with it.
  UPDATE public.visitor_resolve_jobs
     SET status = 'failed',
         ip_raw = NULL,
         last_error = 'Gave up after repeated claims',
         finished_at = now()
   WHERE status = 'running'
     AND claimed_at < now() - interval '10 minutes'
     AND attempts >= 3;

  RETURN QUERY
  UPDATE public.visitor_resolve_jobs j
     SET status = 'running',
         attempts = j.attempts + 1,
         claimed_at = now()
   WHERE j.id IN (
     SELECT id FROM public.visitor_resolve_jobs
      WHERE (status = 'queued' AND available_at <= now())
         OR (status = 'running'
             AND claimed_at < now() - interval '10 minutes'
             AND attempts < 3)
      ORDER BY available_at
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20))
   )
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_visitor_resolve_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_visitor_resolve_jobs(integer) TO service_role;
