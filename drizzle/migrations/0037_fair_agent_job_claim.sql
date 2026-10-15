CREATE INDEX IF NOT EXISTS idx_agent_job_items_fair_claim
  ON public.agent_job_items (user_id, created_at, id)
  INCLUDE (job_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.claim_agent_job_items(p_limit integer DEFAULT 8)
RETURNS SETOF public.agent_job_items
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH tenants AS (
    SELECT DISTINCT c.user_id
      FROM public.agent_job_items c
     WHERE c.status = 'pending'
  ),
  candidates AS (
    SELECT x.id,
           row_number() OVER (ORDER BY x.turn, x.created_at, x.id) AS ord
      FROM tenants t
     CROSS JOIN LATERAL (
       SELECT c.id,
              c.created_at,
              row_number() OVER (ORDER BY c.created_at, c.id) AS turn
         FROM public.agent_job_items c
         JOIN public.agent_jobs j ON j.id = c.job_id
        WHERE c.status = 'pending'
          AND c.user_id = t.user_id
          AND j.status IN ('queued', 'running')
        ORDER BY c.created_at, c.id
        LIMIT GREATEST(p_limit, 1) * 8
     ) x
  ),
  locked AS (
    SELECT c.id
      FROM public.agent_job_items c
      JOIN candidates cd ON cd.id = c.id
     WHERE c.status = 'pending'
     ORDER BY cd.ord
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE OF c SKIP LOCKED
  )
  UPDATE public.agent_job_items i
     SET status = 'claimed', claimed_at = now(), attempts = i.attempts + 1
   WHERE i.id IN (SELECT id FROM locked)
  RETURNING i.*;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_job_items(integer) FROM public, anon, authenticated;