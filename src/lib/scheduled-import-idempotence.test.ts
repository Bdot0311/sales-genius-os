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

describe("importing the same search twice adds nothing twice", () => {
  it("drops leads the account already holds", () => {
    expect(code).toMatch(/const freshLeads = formattedLeads\.filter/);
    expect(code).toMatch(/\.insert\(freshLeads\)/);
    // The raw list must not reach the insert any more.
    expect(code).not.toMatch(/\.insert\(formattedLeads\)/);
  });

  it("uses the same notion of a duplicate as the rest of the product", () => {
    /*
     * The rule is lifted from `dropSeenLeads` in fetch-external-leads rather
     * than invented here: the same contact_email, or failing that the same
     * contact_name and company_name. Two definitions of "the same lead" in
     * one product is how one of them quietly stops matching.
     */
    const SEARCH = readFileSync("supabase/functions/fetch-external-leads/index.ts", "utf8");
    for (const src of [code, SEARCH]) {
      expect(src).toMatch(/contact_email, contact_name, company_name/);
    }
    expect(code).toMatch(/seenEmails\.has\(email\)/);
    expect(code).toMatch(/seenPairs\.has\(/);
  });

  it("compares case- and whitespace-insensitively", () => {
    // "Jo@X.com " and "jo@x.com" are one person.
    expect(code).toMatch(/String\(v \?\? ''\)\.trim\(\)\.toLowerCase\(\)/);
  });

  it("keeps at-least-once rather than trading it for at-most-once", () => {
    /*
     * Advancing the schedule before the import would also stop the duplicate,
     * by turning a killed run into a silently skipped import — duplicate
     * leads traded for missing ones. The schedule still advances after the
     * work, and the work is now a no-op on a repeat.
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

  it("still counts what the search found, not what survived the dedupe", () => {
    // A run that found fifty and already held fifty did not find nothing.
    expect(code).toMatch(/leads_count: formattedLeads\.length/);
  });
});
