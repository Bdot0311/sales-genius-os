import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  THIN_BAND,
  bindingConstraint,
  discrimination,
  formatRate,
  isThin,
  projectedReadyDate,
  readinessFraction,
  remaining,
  type BreakdownRow,
  type Readiness,
} from "./dataset-readiness";

/* Line comments only: a string containing "*\/*" opens a block comment to a regex. */
const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");
const FN = code(readFileSync("supabase/functions/admin-dataset-readiness/index.ts", "utf8"));
const MIGRATION = readFileSync("supabase/migrations/20261120120000_outcome_data_layer_readiness.sql", "utf8");
const PAGE = code(readFileSync("src/pages/admin/DatasetReadiness.tsx", "utf8"));

const target = (over: Partial<Readiness> = {}): Readiness => ({
  finalized: 0, positives: 0, target_examples: 2000, target_positives: 100, ready: false, ...over,
});

describe("progress is the worse of the two thresholds", () => {
  it("does not call a dataset nearly ready on volume alone", () => {
    /*
     * 2,000 examples with 40 positives mostly records silence. Averaging the
     * two ratios would report 70%; taking the examples alone would report
     * 100%. Either reading invites training a model that answers "no" to
     * everything.
     */
    const r = target({ finalized: 2000, positives: 40 });
    expect(readinessFraction(r)).toBeCloseTo(0.4);
  });

  it("does not call it ready on positives alone either", () => {
    expect(readinessFraction(target({ finalized: 200, positives: 100 }))).toBeCloseTo(0.1);
  });

  it("is 1 only when both are met, and never exceeds 1", () => {
    expect(readinessFraction(target({ finalized: 2000, positives: 100 }))).toBe(1);
    expect(readinessFraction(target({ finalized: 9000, positives: 900 }))).toBe(1);
  });

  it("is 0 on an empty dataset rather than NaN", () => {
    expect(readinessFraction(target())).toBe(0);
  });
});

describe("bindingConstraint says what to actually do", () => {
  it("names positives when they are the scarcer half", () => {
    expect(bindingConstraint(target({ finalized: 1900, positives: 10 }))).toBe("positives");
  });
  it("names volume when that is the gap", () => {
    expect(bindingConstraint(target({ finalized: 100, positives: 95 }))).toBe("examples");
  });
  it("names neither once both are met", () => {
    expect(bindingConstraint(target({ finalized: 2000, positives: 100 }))).toBe("none");
  });
});

describe("remaining never goes negative", () => {
  it("reports zero rather than a negative shortfall", () => {
    expect(remaining(target({ finalized: 5000, positives: 500 }))).toEqual({ examples: 0, positives: 0 });
  });
  it("reports the real shortfall otherwise", () => {
    expect(remaining(target({ finalized: 1200, positives: 30 }))).toEqual({ examples: 800, positives: 70 });
  });
});

describe("thin bands are not read as rates", () => {
  const band = (finalized: number, rate: number | null): BreakdownRow =>
    ({ value: "x", finalized, positives: Math.round(finalized * (rate ?? 0)), positive_rate: rate });

  it("marks a band too small for its rate to mean anything", () => {
    /*
     * Four examples can only ever show 0%, 25%, 50% or 75%, and each of those
     * looks like a finding.
     */
    expect(isThin(band(4, 0.25))).toBe(true);
    expect(isThin(band(THIN_BAND - 1, 0.5))).toBe(true);
  });

  it("does not mark a band at the floor", () => {
    expect(isThin(band(THIN_BAND, 0.1))).toBe(false);
  });
});

describe("discrimination answers whether a dimension predicts anything", () => {
  const band = (value: string, finalized: number, rate: number): BreakdownRow =>
    ({ value, finalized, positives: Math.round(finalized * rate), positive_rate: rate });

  it("is near zero when every band replies at the same rate", () => {
    // The finding that matters: the recommendation separates nothing.
    const flat = [band("email_now", 500, 0.04), band("research_first", 400, 0.041), band("skip", 300, 0.039)];
    expect(discrimination(flat)!).toBeLessThan(0.01);
  });

  it("is the spread when a dimension does separate", () => {
    const spread = [band("email_now", 500, 0.12), band("skip", 400, 0.02)];
    expect(discrimination(spread)!).toBeCloseTo(0.1);
  });

  it("ignores thin bands, whose rates are noise", () => {
    const noisy = [band("a", 500, 0.05), band("b", 400, 0.06), band("c", 2, 1)];
    // The 100% band would otherwise read as a spread of 95 points.
    expect(discrimination(noisy)!).toBeCloseTo(0.01);
  });

  it("is null when fewer than two bands are thick enough to compare", () => {
    expect(discrimination([band("a", 500, 0.05)])).toBeNull();
    expect(discrimination([band("a", 2, 0.5), band("b", 3, 0)])).toBeNull();
    expect(discrimination([])).toBeNull();
  });
});

describe("formatRate", () => {
  it("shows an absent rate as unknown, not as zero", () => {
    expect(formatRate(null)).toBe("—");
    expect(formatRate(Number.NaN)).toBe("—");
    expect(formatRate(0)).toBe("0.0%");
  });
  it("shows a rate to one decimal", () => {
    expect(formatRate(0.0412)).toBe("4.1%");
  });
});

describe("projectedReadyDate", () => {
  const hist = (rows: [string, number, number][]) =>
    rows.map(([as_of, finalized, positives]) => ({ as_of, finalized, positives }));

  it("projects from the slope of the history, not from total volume", () => {
    const history = hist([["2026-01-01", 0, 0], ["2026-01-11", 100, 10]]);
    const at = projectedReadyDate(history, target({ finalized: 100, positives: 10 }), new Date("2026-01-11"));
    /*
     * 10 examples and 1 positive a day. 1,900 more examples is 190 days; 90
     * more positives is 90 days. The later of the two is the date, because
     * both thresholds have to be met.
     */
    expect(at).not.toBeNull();
    expect(Math.round((at!.getTime() - new Date("2026-01-11").getTime()) / 86_400_000)).toBe(190);
  });

  it("is driven by positives when those are the slower half", () => {
    /*
     * 100 examples a day, 1 positive a day. The remaining 1,000 examples
     * arrive in 10 days; the remaining 90 positives take 90, and that is the
     * date.
     */
    const history = hist([["2026-01-01", 0, 0], ["2026-01-11", 1000, 10]]);
    const at = projectedReadyDate(history, target({ finalized: 1000, positives: 10 }), new Date("2026-01-11"));
    expect(Math.round((at!.getTime() - new Date("2026-01-11").getTime()) / 86_400_000)).toBe(90);
  });

  it("gives no date when nothing is moving, rather than a date far away", () => {
    expect(projectedReadyDate(hist([["2026-01-01", 50, 5], ["2026-01-11", 50, 5]]), target({ finalized: 50, positives: 5 })))
      .toBeNull();
  });

  it("gives no date when the dataset is shrinking", () => {
    /*
     * A falling slope is not a slow approach, it is moving away. Without the
     * guard the division is negative and finite, so the projection would be a
     * date in the PAST, which reads as "ready already".
     */
    const at = projectedReadyDate(
      hist([["2026-01-01", 500, 50], ["2026-01-11", 400, 40]]),
      target({ finalized: 400, positives: 40 }),
      new Date("2026-01-11"),
    );
    expect(at).toBeNull();
  });

  it("gives no date from a single point", () => {
    expect(projectedReadyDate(hist([["2026-01-01", 10, 1]]), target())).toBeNull();
  });

  it("is today once both thresholds are already met", () => {
    const today = new Date("2026-06-01");
    const at = projectedReadyDate(hist([["2026-01-01", 0, 0], ["2026-05-01", 3000, 200]]),
      target({ finalized: 3000, positives: 200 }), today);
    expect(at).toEqual(today);
  });
});

describe("the export carries features and labels, not people", () => {
  it("names every column explicitly rather than excluding some", () => {
    /*
     * An allowlist, so a column added to training_examples later is withheld
     * until somebody decides it belongs in an export rather than appearing in
     * one by default.
     */
    expect(FN).toContain("export const EXPORT_COLUMNS");
    expect(FN).toMatch(/\.select\(EXPORT_COLUMNS\.join\(","\)\)/);
  });

  it("carries no identifier that joins back to a person", () => {
    const list = FN.slice(FN.indexOf("EXPORT_COLUMNS = ["), FN.indexOf("] as const", FN.indexOf("EXPORT_COLUMNS = [")));
    for (const forbidden of [
      "user_id", "lead_id", "send_id", "snapshot_id", "enrollment_id", "sequence_id",
      "to_email", "contact_email", "contact_name", "company_name",
      "subject", "body_html", "body_text", "reply_content",
    ]) {
      expect(list, `${forbidden} must not be exported`).not.toMatch(new RegExp(`"${forbidden}"`));
    }
  });

  it("exports finished rows only", () => {
    // An open conversation has no outcome; exporting one labels it a failure.
    expect(FN).toContain('.eq("is_final", true)');
  });

  it("is founder-gated before anything is read", () => {
    const gate = FN.indexOf("requireInternalOrAdmin(req)");
    const read = FN.indexOf('from("training_examples")');
    expect(gate).toBeGreaterThan(0);
    expect(read).toBeGreaterThan(gate);
  });
});

describe("the readiness SQL", () => {
  it("requires both thresholds to call the dataset ready", () => {
    expect(MIGRATION).toContain("t.finalized >= public.dataset_target_examples()");
    expect(MIGRATION).toContain("AND t.positives >= public.dataset_target_positives()");
  });

  it("counts finished examples only", () => {
    expect(MIGRATION).toContain("FROM public.training_examples WHERE is_final");
    expect(MIGRATION).toContain("WHERE is_final\n    GROUP BY");
  });

  it("allowlists the breakdown dimension rather than interpolating it", () => {
    // The function is SECURITY DEFINER, so a caller-supplied column name would
    // be an injection point into the whole schema.
    expect(MIGRATION).toContain("IF p_dimension NOT IN (");
    expect(MIGRATION).toContain("is not a reportable dimension");
    expect(MIGRATION).toMatch(/format\(\$q\$/);
    expect(MIGRATION).toContain("%1$I");
  });

  it("keeps both functions away from browser clients", () => {
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.dataset_readiness() FROM PUBLIC");
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.dataset_breakdown(text) FROM PUBLIC");
    expect(MIGRATION).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.dataset_\w+\([^)]*\) TO authenticated/);
  });

  it("reports an empty dataset as no rate rather than zero", () => {
    expect(MIGRATION).toContain("CASE WHEN t.finalized = 0 THEN NULL");
  });
});

describe("the page reads the dataset honestly", () => {
  it("draws one bar from the worse ratio, not two side by side", () => {
    expect(PAGE).toContain("readinessFraction(readiness)");
    expect(PAGE).toContain('role="progressbar"');
  });

  it("names the binding constraint instead of only a percentage", () => {
    expect(PAGE).toContain("bindingConstraint(readiness)");
    expect(PAGE).toContain("Positives are the constraint");
  });

  it("marks thin bands and says why", () => {
    expect(PAGE).toContain("isThin(row)");
    expect(PAGE).toContain("arithmetic rather than evidence");
  });

  it("leads with the question the data layer exists to answer", () => {
    expect(PAGE).toContain("Lead Intelligence recommendation");
    expect(PAGE).toContain("predicts nothing yet");
    // First in the list, not alphabetical.
    const dims = PAGE.slice(PAGE.indexOf("const DIMENSIONS"), PAGE.indexOf("export default"));
    expect(dims.indexOf("send_recommendation")).toBeLessThan(dims.indexOf("seniority"));
  });

  it("is reachable from the admin panel", () => {
    const group = readFileSync("src/pages/admin/groups/HealthGroup.tsx", "utf8");
    expect(group).toContain("AdminDatasetReadiness");
    expect(group).toContain('value: "dataset"');
  });
});
