import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * A rescore that was claimed and never finished was stuck for good.
 *
 * `claim_rescore_items` set a row to 'processing' and stamped `claimed_at`.
 * Nothing read that column and nothing returned a 'processing' row to
 * 'pending' — the word did not appear in the drain, which only ever wrote
 * 'done' or 'error'. A run that died after claiming left those leads holding
 * whatever score they had, with no path back and nothing to say so. The queue
 * is how a lead's ICP fit and signal score stay current, so the symptom was a
 * badge that quietly stopped moving.
 *
 * Two more of the same classes the other two queues had: the batch was chosen
 * by `enqueued_at` across the whole table, and selection happened in the edge
 * function, so two overlapping drains read the same ids and the loser claimed
 * nothing instead of taking the next batch. Measured on a real cluster: three
 * simultaneous drains now take 50 rows each, 150 distinct.
 */

const MIGRATIONS = "supabase/migrations";
const DRAIN = readFileSync("supabase/functions/process-rescore-queue/index.ts", "utf8");
/** Body only: a comment quoting code must not satisfy an assertion about it. */
const code = DRAIN.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function liveFile(name: string): string {
  const create = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(`${MIGRATIONS}/${f}`, "utf8").includes(create))
    .pop();
  expect(file, `nothing defines ${name}`).toBeTruthy();
  return readFileSync(`${MIGRATIONS}/${file}`, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "");
}


/**
 * One function's body, not the file it lives in.
 *
 * `liveFile` returns the whole migration, and this migration defines three
 * functions. An assertion matched against the file is satisfied by any of
 * them — reverting `release_rescore_items` to a single set-based UPDATE left
 * the loop and the exception handler in `release_stale_rescore_items` in the
 * same file, and the test stayed green on exactly the regression it exists to
 * catch. Found by making that change and watching it pass.
 *
 * Anchored on the CREATE, because `FUNCTION public.<name>` also appears in
 * the REVOKE and GRANT that follow each definition.
 */
function liveBody(name: string): string {
  const create = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const whole = liveFile(name);
  const from = whole.lastIndexOf(create);
  expect(from, `${name} is not defined where its file says`).toBeGreaterThan(-1);
  const end = whole.indexOf("\n$$;", from);
  expect(end, `${name} has no closing $$;`).toBeGreaterThan(from);
  const body = whole.slice(from, end);
  expect(body, `${name} slice does not look like a function body`).toContain("LANGUAGE");
  return body;
}

const sql = liveBody("release_stale_rescore_items");

describe("a claim nobody came back for is recovered", () => {
  it("has a sweep at all", () => {
    expect(sql).toContain("FUNCTION public.release_stale_rescore_items");
  });

  it("hands an interrupted row back to pending", () => {
    // The stale, not-yet-exhausted rows are what the loop selects, and the
    // body puts them back. Asserted as the pair rather than as one statement,
    // because the release became row-by-row to contain a unique violation.
    expect(sql).toMatch(/claimed_at < now\(\) - interval '15 minutes'\s*\n\s*AND attempts < 3/);
    expect(sql).toMatch(/SET status = 'pending', claimed_at = NULL/);
  });

  it("retires a row that fails every time instead of looping forever", () => {
    // Without the attempts cap the sweep would hand the same unscoreable row
    // back every fifteen minutes for good.
    expect(sql).toMatch(/SET status = 'error'[\s\S]{0,200}?attempts >= 3/);
  });

  it("runs before the drain takes more work", () => {
    expect(code).toContain('rpc("release_stale_rescore_items")');
    expect(code.indexOf('rpc("release_stale_rescore_items")'))
      .toBeLessThan(code.indexOf('rpc("claim_rescore_items"'));
  });

  it("gives the attempt back when a run hands a claim over unused", () => {
    /*
     * Three budget stops in a row would otherwise retire a row no rescore was
     * ever attempted for — the exact bug 20261003120000 fixed for the
     * drafting queue.
     */
    expect(liveBody("release_rescore_items"))
      .toMatch(/attempts = GREATEST\(attempts - 1, 0\)/);
  });
});

describe("the drain claims rather than choosing", () => {
  it("asks for a batch by size, not by id", () => {
    expect(code).toMatch(/rpc\("claim_rescore_items", \{ p_limit: batch \}\)/);
    expect(code).not.toContain("p_row_ids");
  });

  it("no longer reads the queue to pick the batch", () => {
    // Choosing here is what made two overlapping drains fight over the same
    // ids and leave one empty-handed.
    expect(code).not.toMatch(/from\("rescore_queue"\)[\s\S]{0,200}?\.eq\("status", "pending"\)/);
  });

  it("drops the id-taking version rather than leaving an overload", () => {
    /*
     * CREATE OR REPLACE with a different parameter type adds an overload
     * instead of replacing, and PostgREST would then have two candidates for
     * one RPC name — one of which bypasses the fair ordering entirely.
     */
    expect(liveFile("claim_rescore_items"))
      .toContain("DROP FUNCTION IF EXISTS public.claim_rescore_items(uuid[]);");
  });

  it("takes turns across accounts, like the other two queues", () => {
    const claim = liveBody("claim_rescore_items");
    expect(claim).toMatch(/r\.queue = 'rescore_queue'/);
    expect(claim).toMatch(/ORDER BY CASE\s*\n\s*WHEN r\.last_served_at > now\(\) - interval/);
    expect(claim).toContain("FOR UPDATE OF c SKIP LOCKED");
  });

  it("still takes an account's own rows oldest first", () => {
    expect(liveBody("claim_rescore_items"))
      .toMatch(/row_number\(\) OVER \(ORDER BY c\.enqueued_at, c\.id\) AS turn/);
  });
});

describe("a run that overruns does not strand its claims", () => {
  it("stops on a wall clock", () => {
    // A killed run cannot hand anything back, which is how rows got stuck.
    expect(code).toMatch(/const BUDGET_MS = \d+_?\d*;/);
    expect(code).toMatch(/if \(outOfTime\(\)\) \{\s*releaseLater\.push\(row\.id\);/);
  });

  it("hands back what it did not reach", () => {
    expect(code).toMatch(/rpc\("release_rescore_items", \{ p_ids: releaseLater \}\)/);
  });
});

describe("the recovery path is reachable, and one lead cannot abort it", () => {
  /*
   * Both found in review of the migration above, both reproduced on a real
   * cluster before being fixed.
   */
  const trigger = liveBody("trigger_rescore_queue");
  const releaseStale = liveBody("release_stale_rescore_items");
  const release = liveBody("release_rescore_items");

  it("sweeps before deciding there is nothing to do", () => {
    /*
     * The sweep lives in the drain, and the drain is only called by this
     * trigger — which returned early on a pending count of zero. A run that
     * died after claiming the last batch left rows 'processing' and none
     * 'pending', so the count was zero, the drain was never called, and the
     * recovery inside it never ran. Reachable only while something else was
     * already queued, which is precisely not the stuck case.
     */
    const sweepAt = trigger.indexOf("PERFORM public.release_stale_rescore_items()");
    const countAt = trigger.indexOf("INTO pending_ct");
    expect(sweepAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(-1);
    expect(sweepAt).toBeLessThan(countAt);
  });

  it("still signs the drain with the internal job key", () => {
    /*
     * A regression guard on this very rewrite. The copy of this function in
     * supabase/migrations signs with the anon key; the live one signs with
     * internal_job_key(). The drain is behind requireServiceRole, which
     * rejects the anon key outright, so rebuilding this from the older copy
     * would have 401'd the whole queue.
     */
    expect(trigger).toContain("public.internal_job_key()");
    expect(trigger).not.toContain("supabase_anon_key");
  });

  it("releases row by row so a conflict cannot take the batch with it", () => {
    /*
     * uq_rescore_queue_pending_lead is unique on lead_id WHERE status =
     * 'pending' and does not cover 'processing', so a new signal can enqueue
     * a second row for a lead whose first row is claimed. Handing the claimed
     * one back then violates the index — and as one set-based UPDATE, that
     * raised and rolled back every other lead's recovery too.
     */
    for (const fn of [release, releaseStale]) {
      expect(fn).toMatch(/FOR r IN[\s\S]*?LOOP/);
      expect(fn).toMatch(/EXCEPTION WHEN unique_violation THEN/);
      expect(fn).toMatch(/DELETE FROM public\.rescore_queue WHERE id = r\.id/);
    }
  });

  it("retires exhausted rows whatever happened to the rest", () => {
    // In the old shape this UPDATE was rolled back by one unlucky lead, so
    // nothing ever reached 'error'. 'error' is not in the unique index, so
    // this branch cannot conflict on its own.
    const errorAt = releaseStale.indexOf("SET status = 'error'");
    const loopEnd = releaseStale.indexOf("END LOOP;");
    expect(errorAt).toBeGreaterThan(loopEnd);
  });
});
