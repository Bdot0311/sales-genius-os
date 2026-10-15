CREATE TABLE IF NOT EXISTS public.queue_tenant_turn (
  queue text NOT NULL,
  user_id uuid NOT NULL,
  served_count bigint NOT NULL DEFAULT 0,
  last_served_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (queue, user_id)
);

ALTER TABLE public.queue_tenant_turn ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.queue_tenant_turn FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_agent_job_items(p_limit integer DEFAULT 8)
RETURNS SETOF public.agent_job_items
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH tenants AS (
    SELECT c.user_id, min(c.created_at) AS oldest
      FROM public.agent_job_items c
      JOIN public.agent_jobs j ON j.id = c.job_id
     WHERE c.status = 'pending'
       AND j.status IN ('queued', 'running')
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
        ON r.queue = 'agent_job_items' AND r.user_id = t.user_id
  ),
  candidates AS (
    SELECT x.id,
           row_number() OVER (ORDER BY x.turn, s.seat, x.id) AS ord
      FROM seated s
     CROSS JOIN LATERAL (
       SELECT c.id,
              row_number() OVER (ORDER BY c.created_at, c.id) AS turn
         FROM public.agent_job_items c
         JOIN public.agent_jobs j ON j.id = c.job_id
        WHERE c.status = 'pending'
          AND c.user_id = s.user_id
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
  ),
  claimed AS (
    UPDATE public.agent_job_items i
     SET status = 'claimed', claimed_at = now(), attempts = i.attempts + 1
     WHERE i.id IN (SELECT id FROM locked)
    RETURNING i.*
  ),
  served AS (
    INSERT INTO public.queue_tenant_turn AS q (queue, user_id, served_count, last_served_at)
    SELECT 'agent_job_items', u.user_id, u.rows_claimed, clock_timestamp()
      FROM (SELECT user_id, count(*) AS rows_claimed FROM claimed GROUP BY user_id) u
    ON CONFLICT (queue, user_id) DO UPDATE
       SET served_count = CASE
                            WHEN q.last_served_at > clock_timestamp() - interval '10 minutes'
                              THEN q.served_count + excluded.served_count
                            ELSE excluded.served_count
                          END,
           last_served_at = clock_timestamp()
    RETURNING 1
  )
  SELECT * FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.claim_agent_job_items(integer) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_due_scheduled_emails(p_limit integer DEFAULT 20)
RETURNS SETOF public.sent_emails
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH tenants AS (
    SELECT c.user_id, min(c.scheduled_at) AS oldest
      FROM public.sent_emails c
     WHERE c.status = 'scheduled'
       AND c.send_claimed_at IS NULL
       AND c.scheduled_at IS NOT NULL
       AND c.scheduled_at <= now()
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
        ON r.queue = 'sent_emails' AND r.user_id = t.user_id
  ),
  candidates AS (
    SELECT x.id,
           row_number() OVER (ORDER BY x.turn, s.seat, x.id) AS ord
      FROM seated s
     CROSS JOIN LATERAL (
       SELECT c.id,
              row_number() OVER (ORDER BY c.scheduled_at, c.id) AS turn
         FROM public.sent_emails c
        WHERE c.status = 'scheduled'
          AND c.send_claimed_at IS NULL
          AND c.scheduled_at IS NOT NULL
          AND c.scheduled_at <= now()
          AND c.user_id = s.user_id
        ORDER BY c.scheduled_at, c.id
        LIMIT GREATEST(p_limit, 1) * 4
     ) x
  ),
  locked AS (
    SELECT c.id
      FROM public.sent_emails c
      JOIN candidates cd ON cd.id = c.id
     WHERE c.status = 'scheduled'
       AND c.send_claimed_at IS NULL
     ORDER BY cd.ord
     LIMIT GREATEST(p_limit, 1)
     FOR UPDATE OF c SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.sent_emails e
     SET send_claimed_at = now()
     WHERE e.id IN (SELECT id FROM locked)
    RETURNING e.*
  ),
  served AS (
    INSERT INTO public.queue_tenant_turn AS q (queue, user_id, served_count, last_served_at)
    SELECT 'sent_emails', u.user_id, u.rows_claimed, clock_timestamp()
      FROM (SELECT user_id, count(*) AS rows_claimed FROM claimed GROUP BY user_id) u
    ON CONFLICT (queue, user_id) DO UPDATE
       SET served_count = CASE
                            WHEN q.last_served_at > clock_timestamp() - interval '10 minutes'
                              THEN q.served_count + excluded.served_count
                            ELSE excluded.served_count
                          END,
           last_served_at = clock_timestamp()
    RETURNING 1
  )
  SELECT * FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.claim_due_scheduled_emails(integer) FROM public, anon, authenticated;