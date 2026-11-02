import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BACKFILL_DETECTORS,
  backfillSourceFilter,
  detectorsToBackfill,
} from "../../supabase/functions/_shared/signal-backfill.ts";

const RESEARCH = readFileSync(
  new URL("../../supabase/functions/research-lead/index.ts", import.meta.url),
  "utf8",
);

/**
 * Research tops up signals for a lead that was never enriched, and it ran two
 * of the three detectors.
 *
 * Hiring was missing — the highest-weighted signal of the three. The gate was
 * the other half: one `.or()` asked whether any news-or-tech row existed and
 * skipped BOTH detectors if either did, so appending hiring to that list would
 * have left a lead with a news signal still never having its job board read.
 *
 * The first version of this test asserted on the source text of
 * `research-lead` and could not tell the two apart: reverting to the shared
 * gate kept every string it grepped for, so it passed on the mutation it
 * existed to catch. Hence a function, and hence these.
 */
describe("which detectors still owe this lead a signal", () => {
  const names = (sources: Array<string | null | undefined>) =>
    detectorsToBackfill(sources).map((d) => d.fn);

  it("a lead with nothing on record gets all three", () => {
    expect(names([])).toEqual([
      "detect-news-signals",
      "detect-tech-signals",
      "detect-hiring-signals",
    ]);
  });

  it("a lead with a news signal still gets its job board read", () => {
    /*
     * THE case. Under the shared gate this returned nothing, because one row
     * of any kind counted as "already done" for every detector.
     */
    expect(names(["news:predictleads"])).toEqual([
      "detect-tech-signals",
      "detect-hiring-signals",
    ]);
  });

  it("a lead with hiring already recorded is not re-polled for it", () => {
    expect(names(["ats:greenhouse"])).toEqual([
      "detect-news-signals",
      "detect-tech-signals",
    ]);
  });

  it("all three on record means no work", () => {
    expect(names(["news:predictleads", "tech:bloomberry", "ats:lever"])).toEqual([]);
  });

  it("nulls and empty strings count as nothing on record", () => {
    // `source` is nullable, and a null must not read as "already covered".
    expect(names([null, undefined, ""])).toHaveLength(3);
  });

  it("a prefix match is a prefix, not a substring", () => {
    // A source that merely contains `ats:` later in the string is a different
    // detector's row and must not satisfy hiring.
    expect(names(["news:ats:something"])).toContain("detect-hiring-signals");
  });
});

describe("the prefixes match what the detectors write", () => {
  /*
   * Gating on a prefix no detector emits would re-poll on every research call
   * forever. Pinned against the detector sources, not assumed.
   */
  const SOURCE_EXPR: Record<string, string> = {
    "detect-hiring-signals": "source: `ats:${board.provider}`",
  };

  for (const [fn, expr] of Object.entries(SOURCE_EXPR)) {
    it(`${fn} writes the prefix it is gated on`, () => {
      const src = readFileSync(
        new URL(`../../supabase/functions/${fn}/index.ts`, import.meta.url),
        "utf8",
      );
      expect(src).toContain(expr);
    });
  }

  it("every detector in the list has a distinct, colon-terminated prefix", () => {
    const prefixes = BACKFILL_DETECTORS.map((d) => d.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const p of prefixes) expect(p.endsWith(":"), p).toBe(true);
  });

  it("the filter asks the database for exactly those prefixes", () => {
    const filter = backfillSourceFilter();
    for (const d of BACKFILL_DETECTORS) {
      expect(filter).toContain(`source.ilike.${d.prefix}%`);
    }
  });
});

describe("research-lead uses the shared decision", () => {
  it("it calls the function rather than inlining the gate", () => {
    expect(RESEARCH).toContain("detectorsToBackfill(");
    expect(RESEARCH).toContain("backfillSourceFilter()");
  });

  it("and hiring is among the detectors it can run", () => {
    expect(BACKFILL_DETECTORS.map((d) => d.fn)).toContain("detect-hiring-signals");
  });
});
