import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A scheduled import that ran twice created the same leads twice.
 *
 * `next_run_at` is advanced only after the insert, and this function has no
 * wall clock, so a run the platform stops around 150s leaves the leads in and
 * the schedule un-advanced — and the next hourly pass imports the same search
 * again. Nothing caught it: there is no unique constraint on `leads`.
 *
 * Two rows for one prospect is not untidy data. It is two sequences and two
 * emails to someone who was contacted once, which is the same harm as the
 * duplicate-send race, arriving by a different road.
 */

const IMPORT = readFileSync("supabase/functions/run-scheduled-imports/index.ts", "utf8");
/** Body only: a comment quoting code must not satisfy an assertion about it. */
const code = IMPORT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the import uses the shared rule rather than its own", () => {
  /*
   * The behaviour of the rule itself is covered by running it, in
   * lead-dedupe.test.ts. What is left here is what a behavioural test cannot
   * see: that this function actually calls it, and in the right order.
   */
  it("filters before inserting, and inserts only what survived", () => {
    expect(code).toMatch(/const freshLeads = dropAlreadyHeld\(/);
    expect(code).toMatch(/\.insert\(freshLeads\)/);
    expect(code).not.toMatch(/\.insert\(formattedLeads\)/);
  });

  it("sizes the lookup by the import rather than the account", () => {
    /*
     * A 5,000 row cap on the account's leads is a correctness hole rather
     * than a soft limit: past it the picture of what the account holds is
     * incomplete, and the leads outside the window come back as new.
     */
    expect(code).toMatch(/emailsToCheck\(formattedLeads\)/);
    expect(code).toMatch(/lookupBy\('contact_email', wantEmails\)/);
    /*
     * And compares the way the filter does. `in` is case-sensitive in
     * Postgres, so asking for "jo@x.com" misses a stored "Jo@X.com" and the
     * lead is inserted again — which the account-wide scan this replaced did
     * not do, because it normalised in memory.
     */
    expect(code).toMatch(/\.or\(orIlike\(column, run\)\)/);
    expect(code).not.toMatch(/\.in\(column, run\)/);
  });

  it("treats a failed lookup as unknown, not as an empty account", () => {
    /*
     * Ignoring this error was the same mistake as ignoring the insert's,
     * committed in the same change: a transient read failure made every
     * arriving prospect look new, and the insert that followed wrote the
     * duplicates the guard exists to prevent.
     */
    /*
     * The outer guard, not the inner one.
     *
     * There are two `if (lookupFailed)` now: one inside the per-chunk helper,
     * which returns from it, and the one that decides what the schedule does.
     * Anchored on the brace so the helper's early return cannot stand in for
     * the skip — and sliced by distance rather than to the next brace, since
     * the block logs the schedule id through a template literal and the first
     * `}` is inside `${...}`.
     */
    const at = code.indexOf("if (lookupFailed) {");
    expect(at, "the schedule should be skipped when the lookup fails").toBeGreaterThan(-1);
    expect(code.slice(at, at + 400)).toContain("continue;");
  });

  it("skips without advancing the schedule, so the next pass retries", () => {
    // The one direction that cannot do harm.
    const skipAt = code.indexOf("if (lookupFailed) {");
    const advanceAt = code.indexOf("next_run_at: nextRun.toISOString()");
    expect(skipAt).toBeGreaterThan(-1);
    expect(advanceAt).toBeGreaterThan(skipAt);
  });

  it("keeps at-least-once rather than trading it for at-most-once", () => {
    /*
     * Advancing the schedule before the import would also stop the duplicate,
     * by turning a killed run into a silently skipped import — duplicate
     * leads traded for missing ones.
     */
    const insertAt = code.indexOf(".insert(freshLeads)");
    const advanceAt = code.indexOf("next_run_at: nextRun.toISOString()");
    expect(insertAt).toBeGreaterThan(-1);
    expect(advanceAt).toBeGreaterThan(insertAt);
  });
});

describe("a failed import says so", () => {
  it("reads the error it asks for", () => {
    /*
     * `insertError` was destructured and never referenced. A search whose
     * mapping no longer matches imported nothing, every hour, with the reason
     * recorded nowhere — an honest count and an invisible cause, which is the
     * combination that keeps something broken for weeks.
     */
    const uses = [...code.matchAll(/insertError/g)].length;
    expect(uses, "insertError should be read, not just captured").toBeGreaterThan(1);
    expect(code).toMatch(/if \(insertError\)/);
  });

  it("leaves the reason where the user's own history will show it", () => {
    // import_history has no error column, so it rides on the one free-text
    // field the row already carries rather than only in a function log.
    expect(code).toMatch(/import failed: \$\{insertError\.message\}/);
  });

  it("puts the reason before the query, so a long query cannot bury it", () => {
    // The field is sliced to 500. With the query first, a saved query that
    // long pushed the whole message out and left the honest count with an
    // invisible cause again.
    const line = code.slice(code.indexOf("search_query: insertError"));
    const tmpl = line.slice(0, line.indexOf("\n", line.indexOf("`")));
    expect(tmpl.indexOf("import failed")).toBeLessThan(tmpl.indexOf("schedule.search_query"));
  });

  it("still counts what the search found, not what survived the dedupe", () => {
    // A run that found fifty and already held fifty did not find nothing.
    expect(code).toMatch(/leads_count: formattedLeads\.length/);
  });
});
