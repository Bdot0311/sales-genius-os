/*
 * Round-robin with no memory is not round-robin once there are more accounts
 * than slots.
 *
 * 20261015230000 and 20261015234500 number each account's pending items
 * oldest-first and take the batch in that turn order. That fixes the case it
 * was measured on — one bulk account against one small one — and leaves a
 * worse one standing, which review caught and the cluster confirmed:
 *
 * The ordering is `(turn, created_at)`, and both parts are the same on every
 * call. So "whose turn-1 row is oldest" is a stable total order, and with more
 * accounts than the batch holds, the accounts at the back of it never get a
 * slot at all. Measured: 13 accounts each with a 500-item backlog, batches of
 * twelve, sixty calls — the newest account got **0 of 720 slots**. Not slow.
 * Zero, until one of the twelve ahead of it drains completely.
 *
 * Statelessness was the bug. Taking turns requires remembering whose turn it
 * was, so that is what this adds: one row per account per queue, holding when
 * it was last served, and the claim orders accounts by it least-recently-first.
 * An account never served has no row and sorts before everyone, so a brand new
 * signup goes to the front of the next batch rather than the back of a queue
 * it can never reach the front of.
 *
 * ── The second half of the same finding ─────────────────────────────────
 *
 * "Paused accounts can keep winning slots without sending anything." Also real
 * on the send path: a capped or paused account's rows were claimed, deferred,
 * released, and claimed again next minute, burning a slot a minute forever
 * while accounts that could actually send waited.
 *
 * The stamp is written when the rows are claimed, not when they succeed, which
 * is what fixes it: having a turn and not being able to use it still counts as
 * having had it, so a paused account rotates to the back like everyone else
 * instead of holding the front.
 *
 * ── Why a deficit over a window, and not a timestamp or a total ─────────
 *
 * Three versions of this were measured against the cluster before one worked.
 *
 * Ordering accounts purely by when they were last served fixes the starvation
 * and not the unfairness: every account served in a call gets a stamp within
 * microseconds of the others, so the order among them is arbitrary-but-stable
 * and the same two accounts absorb every miss. Measured at 13 accounts and at
 * 20, against batches of twelve: nobody at zero, but a 2x spread between the
 * best and worst served. It only evens out once accounts far outnumber slots
 * (1.25x at 50 accounts, tight at 100) — which is no comfort at the size this
 * product is actually at.
 *
 * A lifetime total fixes the spread and introduces drift. A new account at
 * zero outranks everyone until it catches up to their head start, and an
 * account that goes quiet for a week and comes back outranks the accounts
 * that kept working — the same starvation, pointed the other way.
 *
 * So the counter is kept over a sliding window: it accumulates while an
 * account keeps being served and resets once it has been idle longer than the
 * window. Self-healing, no long-horizon drift, and no reverse starvation. Ten
 * minutes is long enough to cover the deepest backlog's rotation and short
 * enough that an account returning after a pause is treated as new rather than
 * as owed.
 *
 * ── Why clock_timestamp() and not now() ─────────────────────────────────
 *
 * `now()` is transaction-start time, so every stamp written inside one
 * transaction is identical. The first version used it and the newest of
 * thirteen accounts went from 0 slots to 1 out of 720 — because with every
 * stamp equal, the ordering fell straight back to the stable tie-break this
 * table exists to break. In production each claim is its own transaction so
 * the two differ by microseconds, but a value that collapses whenever two
 * claims share a transaction is the wrong one for recording when something
 * actually happened. `clock_timestamp()` is read at the moment of the write.
 */

/*
 * Whose turn it was, per queue.
 *
 * Keyed by queue name as well as account so the drafting queue and the send
 * queue take turns independently — an account that just had a draft slot has
 * not thereby had a send slot. Service-role only: it is written by the claim
 * functions and read by nothing else, and holds no more than an account id and
 * a timestamp.
 */
CREATE TABLE IF NOT EXISTS public.queue_tenant_turn (
  queue text NOT NULL,
  user_id uuid NOT NULL,
  /*
   * Rows claimed for this account inside the current window, not calls it
   * appeared in: an account that took eleven of twelve slots has been served
   * more than one that took a single row, and ordering by calls would call
   * those equal.
   */
  served_count bigint NOT NULL DEFAULT 0,
  last_served_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (queue, user_id)
);

ALTER TABLE public.queue_tenant_turn ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: nothing but the service role touches this.
REVOKE ALL ON TABLE public.queue_tenant_turn FROM anon, authenticated;

/*
 * The drafting claim, now taking actual turns.
 *
 * Shape is otherwise unchanged from 20261015230000 and for the same reasons
 * documented there: a lateral per account so the work is bounded by the batch
 * and the account count rather than by queue depth, `p_limit * 8` of headroom
 * so concurrent drains do not come back short, and FOR UPDATE SKIP LOCKED so
 * two drains never take the same row.
 *
 * What is new is `seat`: accounts are ordered least-recently-served first, and
 * the batch takes everyone's turn-1 row in seat order before anyone's turn-2.
 * The stamp is a data-modifying CTE in the same statement, so a row cannot be
 * claimed without its account being recorded as served.
 */
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
             /*
              * Least-served-in-the-window first. An account with no row, or
              * one whose last turn is older than the window, counts as zero —
              * so a new signup and a returning one both enter level with the
              * most-behind active account rather than ahead of or behind it.
              */
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
    /*
     * Written for every account whose rows were claimed, whatever becomes of
     * them. Having a turn and not being able to use it still counts as having
     * had it, which is what stops a capped or paused account from winning the
     * same slot every minute without sending anything.
     */
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

/*
 * The send claim, the same way.
 *
 * Twenty sends a minute is the whole product's capacity, so this is the queue
 * where being at the back of a stable order hurts most — and the one where a
 * paused account was burning a slot a minute without sending anything.
 */
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
             /*
              * Least-served-in-the-window first. An account with no row, or
              * one whose last turn is older than the window, counts as zero —
              * so a new signup and a returning one both enter level with the
              * most-behind active account rather than ahead of or behind it.
              */
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
    /*
     * Written for every account whose rows were claimed, whatever becomes of
     * them. Having a turn and not being able to use it still counts as having
     * had it, which is what stops a capped or paused account from winning the
     * same slot every minute without sending anything.
     */
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
