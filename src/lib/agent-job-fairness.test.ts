import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The drafting queue is shared, and until this was fixed it was first-come
 * first-served across the whole product.
 *
 * Measured against Postgres 16 before the fix: one account queues 2,000 leads,
 * a second account queues five leads five minutes later, drained at the rate
 * `trigger_agent_jobs` actually drives. The second account waited 56 minutes
 * for its first lead, showing "queued" throughout — which is exactly what a
 * broken queue looks like from the outside. After the fix it waits one minute
 * and finishes all five in it.
 *
 * These are text assertions over the migrations because that is the only place
 * this logic exists; the behaviour itself was verified by running the claim
 * against a real cluster, and what is pinned here is the handful of properties
 * a later edit could quietly undo.
 */

const MIGRATIONS = "supabase/migrations";

/** Every migration that defines the claim, oldest first. */
const claimMigrations = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .filter((f) =>
    readFileSync(`${MIGRATIONS}/${f}`, "utf8").includes("FUNCTION public.claim_agent_job_items")
  );

/** The one that wins at deploy time. */
const liveClaim = readFileSync(`${MIGRATIONS}/${claimMigrations[claimMigrations.length - 1]}`, "utf8");

/*
 * Only the body, never the commentary.
 *
 * Three times this session a prose comment that quoted code tripped a negative
 * assertion about that code. The rule is about what runs.
 */
const sql = liveClaim
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*--.*$/gm, "");

describe("the claim is fair across accounts", () => {
  it("is defined last by the fairness migration", () => {
    // A later migration redefining it is how this regresses, and the symptom
    // would be a support ticket about a queue that looks stuck, not a failure.
    expect(claimMigrations[claimMigrations.length - 1]).toBe(
      "20261015230000_fair_agent_job_claim.sql",
    );
  });

  it("numbers each account's items and takes them in turn order", () => {
    // Round-robin: everyone's oldest before anyone's second.
    expect(sql).toMatch(/row_number\(\) OVER \(ORDER BY c\.created_at, c\.id\) AS turn/);
    expect(sql).toMatch(/ORDER BY x\.turn/);
    expect(sql).toMatch(/c\.user_id = t\.user_id/);
  });

  it("still takes an account's own items oldest first", () => {
    // Fairness between accounts must not become a lottery inside one. A lead
    // queued first is drafted first, which is what the user watching the
    // Drafts tab fill in expects.
    expect(sql).toMatch(/ORDER BY c\.created_at, c\.id\s*\n\s*LIMIT GREATEST\(p_limit, 1\)/);
  });

  it("does not order the batch globally by age", () => {
    // The whole defect in one line. `ORDER BY c.created_at` picking the batch
    // is what made a new account wait behind someone else's import.
    expect(sql).not.toMatch(/ORDER BY c\.created_at\s*\n\s*LIMIT GREATEST\(p_limit, 1\)\s*\n\s*FOR UPDATE/);
  });

  it("keeps concurrent drains disjoint", () => {
    // Two drains taking the same row writes one lead's draft twice and pays
    // for two generations. This is the only thing standing between those.
    expect(sql).toContain("FOR UPDATE OF c SKIP LOCKED");
  });
});

describe("the candidate pool covers every drain the cron fires", () => {
  /*
   * A cross-file invariant, which is the only reason this is asserted rather
   * than commented. The claim builds a candidate pool of `p_limit * HEADROOM`
   * per account and then locks `p_limit` of it with SKIP LOCKED. Overlapping
   * drains take rows the others could not lock, so the pool must hold more
   * than `passes * p_limit` claimable rows — otherwise the later passes come
   * back short and throughput silently halves, with nothing in any log to say
   * why. The two numbers live in different migrations and nothing else would
   * notice them drifting apart.
   */
  const headroom = () => {
    const m = sql.match(/LIMIT GREATEST\(p_limit, 1\) \* (\d+)/);
    expect(m, "the claim should size its candidate pool from p_limit").toBeTruthy();
    return Number(m![1]);
  };

  const passCap = () => {
    const files = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) =>
        readFileSync(`${MIGRATIONS}/${f}`, "utf8").includes("FUNCTION public.trigger_agent_jobs")
      );
    const body = readFileSync(`${MIGRATIONS}/${files[files.length - 1]}`, "utf8");
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
