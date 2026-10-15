import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * The guard that would have caught the icp_profiles insert.
 *
 * icp_profiles.name is NOT NULL with no default. An insert passed only the
 * fields it had computed, and failed on the one path that mattered: the
 * account with no ICP yet. It typechecked, 2,600 tests passed, and nothing in
 * this repository could have caught it, because the shape of a Postgres NOT
 * NULL is not in any TypeScript the call site touches.
 *
 * It is in the generated types — Insert marks a column optional when it is
 * nullable or has a default — so the question is answerable without a
 * database.
 */
describe("the insert guard", () => {
  const run = () => {
    try {
      return { ok: true, out: execFileSync("node", ["scripts/check-insert-columns.mjs"], { encoding: "utf8" }) };
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string };
      return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
    }
  };

  it("passes on the tree as it stands", () => {
    const { ok, out } = run();
    expect(out).toContain("insert-columns");
    expect(ok, out).toBe(true);
  });

  it("checks a meaningful number of them", () => {
    // If a parser change quietly stops matching, this is what notices. It
    // read 122 before the owning-from() fix and 172 after; a collapse back
    // toward zero is the failure mode that looks like success.
    const { out } = run();
    const n = Number(out.match(/(\d+) literal insert/)?.[1] ?? 0);
    expect(n).toBeGreaterThan(120);
  });

  /*
   * The check has to be able to fail, and the first version could not.
   *
   * It scanned forward from each from() to the next insert. A ternary with
   * .update() on one branch and .insert() on the other puts two from() calls
   * on the same table side by side; the scan matched the first, saw a second
   * from() in the gap, skipped — and had already consumed past the insert, so
   * it was never offered again. It reported a clean run against the exact
   * defect it was written for.
   */
  it("finds the insert's owning from() by looking backwards", () => {
    const SRC = readFileSync("scripts/check-insert-columns.mjs", "utf8");
    expect(SRC).toContain("src.matchAll(/\\.(insert|upsert)\\(\\s*\\{/g)");
    expect(SRC).toContain(".pop()");
  });

  it("reads shorthand properties as well as colon ones", () => {
    // `title,` is shorthand for `title: title`, and half these inserts are
    // written that way. Reading only the colon form reported deals.title as
    // absent while it sat on the line being pointed at.
    const SRC = readFileSync("scripts/check-insert-columns.mjs", "utf8");
    expect(SRC).toContain("(?=[,}])");
  });

  it("skips what it cannot see into rather than guessing", () => {
    const SRC = readFileSync("scripts/check-insert-columns.mjs", "utf8");
    expect(SRC).toContain('literal.includes("...")');
    const { out } = run();
    expect(out).toMatch(/\d+ dynamic one\(s\) skipped/);
  });

  it("runs in CI next to the check it completes", () => {
    const WF = readFileSync(".github/workflows/schema-check.yml", "utf8");
    expect(WF).toContain("node scripts/check-insert-columns.mjs");
    const refs = WF.indexOf("check-schema-refs.mjs");
    expect(WF.indexOf("check-insert-columns.mjs")).toBeGreaterThan(refs);
  });
});
