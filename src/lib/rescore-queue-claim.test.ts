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

const sql = liveFile("release_stale_rescore_items");

describe("a claim nobody came back for is recovered", () => {
  it("has a sweep at all", () => {
    expect(sql).toContain("FUNCTION public.release_stale_rescore_items");
  });

  it("hands an interrupted row back to pending", () => {
    expect(sql).toMatch(/SET status = 'pending', claimed_at = NULL[\s\S]{0,200}?attempts < 3/);
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
    expect(liveFile("release_rescore_items"))
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
    const claim = liveFile("claim_rescore_items");
    expect(claim).toMatch(/r\.queue = 'rescore_queue'/);
    expect(claim).toMatch(/ORDER BY CASE\s*\n\s*WHEN r\.last_served_at > now\(\) - interval/);
    expect(claim).toContain("FOR UPDATE OF c SKIP LOCKED");
  });

  it("still takes an account's own rows oldest first", () => {
    expect(liveFile("claim_rescore_items"))
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
