/*
 * A rescore that was claimed and never finished was stuck for good.
 *
 * `claim_rescore_items` sets a row to 'processing' and stamps `claimed_at`.
 * Nothing anywhere reads that column, and nothing anywhere returns a
 * 'processing' row to 'pending' — the word does not appear in the edge
 * function, which only ever writes 'done' or 'error'. So an invocation that
 * dies after claiming (a platform kill, a dropped connection) leaves those
 * leads holding whatever score they had, with no path back. The queue is how
 * a lead's ICP fit and signal score stay current, so the symptom is a badge
 * that quietly stops moving, for exactly the leads whose scores were about to
 * change. Rare per occurrence, permanent when it happens, and invisible.
 *
 * Two more while here, both the same classes the drafting and send queues
 * already had fixed:
 *
 * **Global FIFO.** The drain reads the oldest pending rows by `enqueued_at`
 * across the whole table. One account's bulk import owns the queue and every
 * other account's scores wait behind it.
 *
 * **A colliding drain does nothing.** Selection happened in the edge
 * function — read the oldest N ids, then ask the RPC to claim *those* ids. Two
 * overlapping drains read the same ids, SKIP LOCKED gives them to one, and the
 * other claims zero rows and returns `processed: 0` rather than taking the
 * next N. It wastes a whole pass, and it does it exactly when the queue is
 * deep enough for the one-minute backfill job to be running alongside the
 * five-minute one.
 *
 * Moving selection into the claim fixes the third for free, and is what lets
 * the second be fixed at all.
 */

/*
 * How many times a row has been handed out.
 *
 * Without it the reaper below cannot tell a row interrupted once from a row
 * that fails every time it is picked up, and would hand the second one back
 * forever.
 */
ALTER TABLE public.rescore_queue
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

/* The claim's access path: pending rows per account, oldest first. */
CREATE INDEX IF NOT EXISTS idx_rescore_queue_claimable
  ON public.rescore_queue (user_id, enqueued_at, id)
  WHERE status = 'pending';

/* The reaper's: claimed rows by age. */
CREATE INDEX IF NOT EXISTS idx_rescore_queue_inflight
  ON public.rescore_queue (claimed_at)
  WHERE status = 'processing';

/*
 * Dropped, not replaced.
 *
 * The old signature takes `uuid[]`. `CREATE OR REPLACE` with a different
 * parameter type creates an overload rather than replacing it, and PostgREST
 * would then have two candidates for one RPC name — so the old one goes
 * explicitly. Any caller still passing ids fails loudly at that point instead
 * of silently resolving to the version that bypasses the fair ordering.
 */
DROP FUNCTION IF EXISTS public.claim_rescore_items(uuid[]);

/*
 * Claim a batch, fairly, atomically.
 *
 * Same shape as claim_agent_job_items and claim_due_scheduled_emails, down to
 * the `queue_tenant_turn` memory: accounts are ordered least-served-first over
 * a sliding window, each account's own rows stay oldest-first, the candidate
 * pool keeps headroom so overlapping drains do not come back short, and
 * FOR UPDATE SKIP LOCKED keeps those drains disjoint. See
 * 20261016000500_queue_tenant_turn.sql for why a stateless rotation is not
 * enough.
 */
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

/*
 * Hand back a claim this run will not use.
 *
 * The budget stop needs it: a run that stops early should not make those leads
 * wait fifteen minutes for the reaper. The attempt is given back too, since
 * nothing was tried — otherwise three budget stops in a row would retire a row
 * no rescore was ever attempted for, which is the exact bug
 * 20261003120000 fixed for the drafting queue.
 */
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

/*
 * A claim nobody came back for.
 *
 * Fifteen minutes is past the platform's own kill time for an edge function,
 * so anything still held after it belongs to a run that is gone. Rescoring is
 * idempotent — it recomputes from the lead and its signals — so unlike a send
 * there is no risk in retrying, and the only question is how many times before
 * calling it a bad row.
 */
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

  -- Three times is enough to tell an interrupted run from a row that cannot be
  -- scored. Past that it is a failure, and one that shows up as a status
  -- rather than as a lead whose badge silently stopped moving.
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
