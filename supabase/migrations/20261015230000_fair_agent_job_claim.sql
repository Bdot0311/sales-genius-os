/*
 * One account's bulk run blocked every other account's queue.
 *
 * Measured, not inferred. Against Postgres 16 with the current function:
 * 2,000 leads queued by one account, then five leads queued by a second
 * account five minutes later, drained at the rate trigger_agent_jobs actually
 * drives (three passes of twelve a minute). The second account waited
 * **56 minutes** for its first lead to be picked up — and for all 56 of them
 * its UI said "queued", which is indistinguishable from a broken queue.
 *
 * The cause is one line: `ORDER BY c.created_at` with no notion of who the
 * work belongs to. Strict global FIFO is correct for one tenant and wrong for
 * two, and it gets worse linearly — a 20,000-lead import would have made a
 * new signup's first batch wait most of a day.
 *
 * Nothing about this is a throughput problem, so raising the pass cap would
 * not have fixed it. It is a scheduling problem, and the fix is the standard
 * one: round-robin across accounts, FIFO within an account.
 *
 * ── The shape ───────────────────────────────────────────────────────────
 *
 * Each account's pending items are numbered oldest-first (`turn`), and the
 * batch is taken in `turn` order. Every account's oldest item is considered
 * before anyone's second, so a five-lead batch is served in the same minute it
 * arrives however deep the backlog behind it is, and the big job still gets
 * every slot nobody else wants. Measured on the same scenario: the second
 * account now waits **one minute** and finishes all five in it, while the
 * bulk account still takes 31 of the 36 slots.
 *
 * ── Why a lateral and not one window over everything ────────────────────
 *
 * The obvious version ranks every pending row in one window. It is correct and
 * it does not scale: at 50,000 pending rows the planner sorts all of them to
 * disk (external merge, 2.4MB spilled) for a twelve-row answer, and the cost
 * grows with the whole backlog rather than with the batch.
 *
 * The lateral form touches at most `p_limit * 8` rows per account with a
 * pending item, which is bounded by the batch and the tenant count rather than
 * by the queue depth. At 200,000 pending rows across 40 accounts a claim costs
 * ~90ms against ~40ms for the unfair version it replaces — three times a
 * minute, which is nothing against a backlog that size, and the claim is
 * nowhere near the bottleneck either way.
 *
 * ── The one number that couples to another file ─────────────────────────
 *
 * `p_limit * 8` is headroom for concurrent drains. trigger_agent_jobs fires up
 * to three passes at once, and FOR UPDATE SKIP LOCKED means each takes rows
 * the others could not lock — so the candidate pool has to hold more than
 * `passes * p_limit` claimable rows or the later passes come back short and
 * throughput silently halves. Three passes need a factor of three; eight is
 * margin, and it costs nothing measurable. src/lib/agent-job-fairness.test.ts
 * asserts the factor stays above the pass cap, because the two numbers live in
 * different files and nothing else would catch them drifting apart.
 *
 * FOR UPDATE OF c SKIP LOCKED is carried over unchanged and for the same
 * reason as before: two overlapping drains taking the same row writes one
 * lead's draft twice and pays for two generations. Verified again here with
 * three simultaneous claims — 12 rows each, 36 total, nothing claimed twice.
 */

/*
 * The index the per-account lookup wants.
 *
 * (user_id, created_at, id) WHERE status = 'pending' is exactly the lateral's
 * access path, and job_id is included so the join to agent_jobs does not send
 * it back to the heap. Worth ~30% of the claim at 200,000 pending rows, and it
 * covers the DISTINCT that enumerates the accounts too.
 */
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
