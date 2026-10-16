ALTER TABLE public.rescore_queue
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_rescore_queue_claimable
  ON public.rescore_queue (user_id, enqueued_at, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_rescore_queue_inflight
  ON public.rescore_queue (claimed_at)
  WHERE status = 'processing';

DROP FUNCTION IF EXISTS public.claim_rescore_items(uuid[]);

CREATE OR REPLACE FUNCTION public.claim_rescore_items(p_limit integer DEFAULT 50)
RETURNS TABLE (id uuid, user_id uuid, lead_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH tenants AS (
    SELECT c.user_id, min(c.enqueued_at) AS oldest
      FROM public.rescore_queue c
     WHERE c.status = 'pending'
     GROUP BY c.user_id
  ),
  seated AS (
    SELECT t.user_id,
           row_number() OVER (
             ORDER BY CASE
                        WHEN r.last_served_at > now() - interval '10 minutes'
                          THEN r.served_count
                        ELSE 0
                      END,
                      t.oldest,
                      t.user_id
           ) AS seat
      FROM tenants t
      LEFT JOIN public.queue_tenant_turn r
        ON r.queue = 'rescore_queue' AND r.user_id = t.user_id
  ),
  candidates AS (
    SELECT x.id,
           row_number() OVER (ORDER BY x.turn, s.seat, x.id) AS ord
      FROM seated s
     CROSS JOIN LATERAL (
       SELECT c.id,
              row_number() OVER (ORDER BY c.enqueued_at, c.id) AS turn
         FROM public.rescore_queue c
        WHERE c.status = 'pending'
          AND c.user_id = s.user_id
        ORDER BY c.enqueued_at, c.id
        LIMIT GREATEST(p_limit, 1) * 4
     ) x
  ),
  locked AS (
    SELECT c.id
      FROM public.rescore_queue c
      JOIN candidates cd ON cd.id = c.id
     WHERE c.status = 'pending'
     ORDER BY cd.ord
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE OF c SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.rescore_queue q
       SET status = 'processing', claimed_at = now(), attempts = q.attempts + 1
     WHERE q.id IN (SELECT id FROM locked)
    RETURNING q.id, q.user_id, q.lead_id
  ),
  served AS (
    INSERT INTO public.queue_tenant_turn AS t (queue, user_id, served_count, last_served_at)
    SELECT 'rescore_queue', u.user_id, u.rows_claimed, clock_timestamp()
      FROM (SELECT user_id, count(*) AS rows_claimed FROM claimed GROUP BY user_id) u
    ON CONFLICT (queue, user_id) DO UPDATE
       SET served_count = CASE
                            WHEN t.last_served_at > clock_timestamp() - interval '10 minutes'
                              THEN t.served_count + excluded.served_count
                            ELSE excluded.served_count
                          END,
           last_served_at = clock_timestamp()
    RETURNING 1
  )
  SELECT id, user_id, lead_id FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.claim_rescore_items(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_rescore_items(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_rescore_items(p_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE released integer;
BEGIN
  UPDATE public.rescore_queue
     SET status = 'pending', claimed_at = NULL, attempts = GREATEST(attempts - 1, 0)
   WHERE id = ANY(p_ids)
     AND status = 'processing';
  GET DIAGNOSTICS released = ROW_COUNT;
  RETURN released;
END;
$$;

REVOKE ALL ON FUNCTION public.release_rescore_items(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_rescore_items(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.release_stale_rescore_items()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE released integer;
BEGIN
  UPDATE public.rescore_queue
     SET status = 'pending', claimed_at = NULL
   WHERE status = 'processing'
     AND claimed_at < now() - interval '15 minutes'
     AND attempts < 3;
  GET DIAGNOSTICS released = ROW_COUNT;

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