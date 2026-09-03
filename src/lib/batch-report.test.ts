import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BATCH_CEILING,
  accountFor,
  batchFetchLimit,
  isShortfall,
  shortfallNote,
} from "../../supabase/functions/_shared/batch-report.ts";

/**
 * Reported from the app: "asked it to send 32 emails and it only sent 11, just
 * keeps saying all emails were sent."
 *
 * send_drafts fetched at most 20 rows, deduplicated them to 11, sent those, and
 * reported "Sent 11 of 11" — true about what it processed, silent about the 21
 * it never looked at. The model then reported success, correctly, from its own
 * point of view.
 */
describe("the 32-email failure", () => {
  it("fetches what was actually asked for instead of a fixed page", () => {
    expect(batchFetchLimit(32)).toBe(32);
    // The old behaviour, which is what produced the bug.
    expect(batchFetchLimit(32)).not.toBe(20);
  });

  it("still refuses to act on an unbounded batch", () => {
    expect(batchFetchLimit(5000)).toBe(BATCH_CEILING);
    // "Send everything pending" has no count, and must not become unlimited.
    expect(batchFetchLimit(0)).toBe(BATCH_CEILING);
  });

  it("accounts for every record the caller named", () => {
    // 32 asked for, 20 came back, 11 survived dedupe.
    const a = accountFor(32, 20, 11);
    expect(a.requested).toBe(32);
    expect(a.found).toBe(20);
    expect(a.deduped).toBe(9);
    expect(a.overCeiling).toBe(12);
    expect(isShortfall(a)).toBe(true);
  });

  it("tells the model in words it cannot summarise away", () => {
    const note = shortfallNote(accountFor(32, 20, 11), "were sent", 11);
    expect(note).toContain("32");
    expect(note).toContain("11");
    expect(note).toMatch(/Do NOT say all of them were sent/);
  });
});

describe("a complete batch says nothing", () => {
  it("stays silent when everything asked for was acted on", () => {
    const a = accountFor(12, 12, 12);
    expect(isShortfall(a)).toBe(false);
    expect(shortfallNote(a, "were sent", 12)).toBe("");
  });

  it("does not invent a shortfall for an unbounded request", () => {
    // "send all pending" names no count, so found-vs-requested is meaningless.
    const a = accountFor(0, 8, 8);
    expect(a.overCeiling).toBe(0);
    expect(isShortfall(a)).toBe(false);
  });

  it("still reports dedupe on an unbounded request", () => {
    const a = accountFor(0, 8, 5);
    expect(a.deduped).toBe(3);
    expect(isShortfall(a)).toBe(true);
  });
});

describe("the numbers reach the user whatever the model says", () => {
  const SRC = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

  it("no longer caps a send batch at twenty rows", () => {
    expect(SRC).toMatch(/\.limit\(batchFetchLimit\(requestedCount\)\)/);
  });

  it("appends the real counts in code, not only in the prompt", () => {
    // The prompt already asked the model to report shortfalls. It didn't.
    expect(SRC).toMatch(/batchShortfalls\.push\(/);
    expect(SRC).toMatch(/if \(batchShortfalls\.length > 0\)/);
    expect(SRC).toMatch(/finalText \+=/);
  });

  it("reports per-record send failures rather than rounding them off", () => {
    expect(SRC).toMatch(/failedCount > 0/);
    expect(SRC).toMatch(/did NOT go out/);
  });

  it("applies the same accounting to scheduling", () => {
    // A scheduling request for 32 that queues 11 is the same failure, later.
    expect(SRC.match(/accountFor\(requestedCount, fetchedCount, drafts\.length\)/g) ?? []).toHaveLength(2);
  });
});
