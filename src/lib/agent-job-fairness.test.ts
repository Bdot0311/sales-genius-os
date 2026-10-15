import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The drafting queue is shared, and getting it fair took three attempts.
 *
 * **Global FIFO.** `ORDER BY created_at` across the whole table. Measured
 * against Postgres 16: one account queues 2,000 leads, a second queues five
 * five minutes later, drained at the rate `trigger_agent_jobs` actually
 * drives — the second account waited 56 minutes for its first lead, showing
 * "queued" throughout.
 *
 * **Stateless round-robin.** Number each account's items oldest-first and take
 * the batch in turn order. Fixes that case and leaves a worse one: the order
 * is identical on every call, so with more accounts than slots the ones at the
 * back never get in. Measured at 13 accounts with 500 items each and batches
 * of twelve: the newest account got 0 of 720 slots.
 *
 * **Deficit over a sliding window.** What ships. Accounts are ordered by how
 * many rows were claimed for them recently, least first, and the count resets
 * once an account has been idle past the window. Measured on the same shapes:
 * 110-111 of 1,440 slots each at 13 accounts, 72 each at 20, 28-29 at 50.
 *
 * Text assertions over the migrations, because that is the only place this
 * logic lives. The behaviour itself was verified by running the claim against
 * a real cluster; what is pinned here is what a later edit could quietly undo.
 */

const MIGRATIONS = "supabase/migrations";

/** The migration that defines `name` last, which is the one that wins. */
function liveDefinition(name: string): { file: string; sql: string } {
  /*
   * The last definition of this function, body only.
   *
   * Two things make this fiddlier than reading the newest file. A migration
   * can redefine two claims at once, so an assertion matched against a whole
   * file can be satisfied by the other function and pass while the one it is
   * about says something else. And `FUNCTION public.<name>` also appears in
   * the `REVOKE` that follows each definition — anchoring on it picked the
   * revoke, and the slice then ran from there into the *next* function's body,
   * so every assertion was being made against the wrong code. Anchor on the
   * CREATE.
   */
  const create = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(`${MIGRATIONS}/${f}`, "utf8").includes(create));
  expect(files.length, `nothing defines ${name}`).toBeGreaterThan(0);
  const file = files[files.length - 1];
  const whole = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
  const from = whole.lastIndexOf(create);
  const end = whole.indexOf("\n$$;", from);
  expect(end, `${name} in ${file} has no closing $$;`).toBeGreaterThan(from);
  const body = whole.slice(from, end);
  // A slice that is not a function body means the anchoring broke again, and
  // every assertion below would be measuring the wrong thing.
  expect(body, `${name} slice does not look like a function body`).toContain("RETURNS SETOF");
  return { file, sql: body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "") };
}

const drafting = liveDefinition("claim_agent_job_items");
const sending = liveDefinition("claim_due_scheduled_emails");

describe.each([
  ["the drafting queue", drafting, "agent_job_items", "created_at"],
  ["the send queue", sending, "sent_emails", "scheduled_at"],
])("%s claims fairly", (_label, live, queue, orderCol) => {
  it("takes turns by recent deficit, not by a fixed order", () => {
    // The fixed order is what starved the accounts at the back of it.
    expect(live.sql).toMatch(/ORDER BY CASE\s*\n\s*WHEN r\.last_served_at > now\(\) - interval/);
    expect(live.sql).toMatch(/THEN r\.served_count/);
  });

  it("treats an account with no record, or an idle one, as owed nothing extra", () => {
    // A lifetime total would hand a new account exclusive priority until it
    // caught up, and do the same for one returning after a week away.
    expect(live.sql).toMatch(/ELSE 0\s*\n\s*END,/);
  });

  it("records the turn against the right queue", () => {
    // Keyed per queue so a draft slot is not also counted as a send slot.
    expect(live.sql).toContain(`r.queue = '${queue}'`);
    expect(live.sql).toContain(`SELECT '${queue}', u.user_id, u.rows_claimed`);
  });

  it("counts rows claimed, not calls appeared in", () => {
    // Eleven of twelve slots is not the same as one.
    expect(live.sql).toMatch(/count\(\*\) AS rows_claimed FROM claimed GROUP BY user_id/);
  });

  it("records the turn whether or not the work succeeds", () => {
    /*
     * The other half of the same finding: a capped or paused account's rows
     * were claimed, deferred, released, and claimed again the next minute,
     * burning a slot a minute while accounts that could work waited. Stamping
     * at claim time is what rotates it. Measured with one capped account of
     * thirteen: 7.8% of slots against a 7.7% fair share.
     */
    const claimAt = live.sql.indexOf("claimed AS (");
    const stampAt = live.sql.indexOf("served AS (");
    expect(claimAt).toBeGreaterThan(-1);
    expect(stampAt).toBeGreaterThan(claimAt);
    // One statement, so a row cannot be claimed without the turn being recorded.
    expect(live.sql).not.toMatch(/\$\$;[\s\S]*INSERT INTO public\.queue_tenant_turn/);
  });

  it("still serves an account's own items oldest first", () => {
    // Fairness between accounts must not become a lottery inside one.
    expect(live.sql).toMatch(
      new RegExp(`row_number\\(\\) OVER \\(ORDER BY c\\.${orderCol}, c\\.id\\) AS turn`),
    );
    expect(live.sql).toMatch(/ORDER BY x\.turn, s\.seat/);
  });

  it("keeps concurrent drains disjoint", () => {
    // Two drains on one row writes a lead's draft twice, or sends an email twice.
    expect(live.sql).toContain("FOR UPDATE OF c SKIP LOCKED");
  });

  it("does not order the batch globally by age", () => {
    expect(live.sql).not.toMatch(
      new RegExp(`ORDER BY c\\.${orderCol}\\s*\\n\\s*LIMIT GREATEST\\(p_limit, 1\\)\\s*\\n\\s*FOR UPDATE`),
    );
  });
});

describe("the candidate pool covers every drain the cron fires", () => {
  /*
   * A cross-file invariant, which is why it is asserted rather than
   * commented. The claim builds a pool of `p_limit * HEADROOM` per account and
   * locks `p_limit` of it with SKIP LOCKED. Overlapping drains take rows the
   * others could not lock, so the pool must hold more than `passes * p_limit`
   * claimable rows or the later passes come back short and throughput halves
   * with nothing in any log to say why.
   */
  const headroom = () => {
    const m = drafting.sql.match(/LIMIT GREATEST\(p_limit, 1\) \* (\d+)/);
    expect(m, "the claim should size its candidate pool from p_limit").toBeTruthy();
    return Number(m![1]);
  };

  const passCap = () => {
    const body = readFileSync(
      `${MIGRATIONS}/${
        readdirSync(MIGRATIONS)
          .filter((f) => f.endsWith(".sql"))
          .sort()
          .filter((f) =>
            readFileSync(`${MIGRATIONS}/${f}`, "utf8").includes("FUNCTION public.trigger_agent_jobs")
          )
          .pop()
      }`,
      "utf8",
    );
    /*
     * The cap is the LAST argument of the LEAST, and the first version of this
     * regex read the first one it could — the `1` floor inside the nested
     * GREATEST. It reported a cap of 1, so a pool two deep looked like ample
     * headroom and the assertion below passed on exactly the drift it exists
     * to catch. Found by lowering the factor and watching this stay green.
     *
     * Greedy, and kept on one line so it cannot run past the statement.
     */
    const m = body.match(/passes\s*:=\s*LEAST\(.*,\s*(\d+)\s*\);/);
    expect(m, "trigger_agent_jobs should cap its concurrent passes").toBeTruthy();
    const cap = Number(m![1]);
    // A cap read as 1 is the signature of that misparse: the drain would have
    // no concurrency at all, which is not a configuration anyone would choose.
    expect(cap, "pass cap read from trigger_agent_jobs looks misparsed").toBeGreaterThan(1);
    return cap;
  };

  it("has room for all of them", () => {
    expect(headroom()).toBeGreaterThanOrEqual(passCap());
  });
});
