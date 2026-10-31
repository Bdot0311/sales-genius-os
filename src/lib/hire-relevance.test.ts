import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_GTM_RE,
  HIRING_SIGNAL_TITLE_PATTERNS,
  hireRelevance,
} from "../../supabase/functions/_shared/hire-relevance.ts";

const DETECTOR = readFileSync(
  new URL("../../supabase/functions/detect-hiring-signals/index.ts", import.meta.url),
  "utf8",
);
const ICP_PAGE = readFileSync(new URL("../pages/ICP.tsx", import.meta.url), "utf8");

/**
 * The detector asked one hardcoded question — is this a sales, revops, growth
 * or marketing role? — which is right for selling outbound tooling and wrong
 * for everyone else using the product.
 *
 * Someone selling to engineering leaders had "hiring 4 backend engineers"
 * filed as `hiring_growth` at weight 12, a third of what that signal is worth
 * to them, while a company's one stale marketing opening scored 30.
 *
 * The data was already there. `icp_profiles.hiring_signals` is a MultiSelect on
 * the ICP page, and its only previous use was being pasted into a model prompt
 * as prose. Nothing read it as a rule.
 */
describe("relevance follows the seller's ICP", () => {
  it("uses the hiring signals the user picked", () => {
    const r = hireRelevance({ hiring_signals: ["Hiring Engineers (scaling)"] });
    expect(r.source).toBe("icp_hiring_signals");
    expect(r.isRelevant("Senior Backend Engineer")).toBe(true);
    expect(r.isRelevant("Site Reliability Engineer")).toBe(true);
    // And an SDR posting is NOT their signal, which is the whole point.
    expect(r.isRelevant("Sales Development Representative")).toBe(false);
  });

  it("the engineering seller and the GTM seller get different answers", () => {
    /*
     * The same job board, two sellers, two verdicts. Under the old regex both
     * got the go-to-market answer.
     */
    const eng = hireRelevance({ hiring_signals: ["Hiring Engineers (scaling)"] });
    const gtm = hireRelevance({ hiring_signals: ["Hiring SDRs / BDRs", "Hiring AEs"] });
    const posting = "Staff Platform Engineer";
    expect(eng.isRelevant(posting)).toBe(true);
    expect(gtm.isRelevant(posting)).toBe(false);
    const sdr = "SDR, Mid-Market";
    expect(eng.isRelevant(sdr)).toBe(false);
    expect(gtm.isRelevant(sdr)).toBe(true);
  });

  it("several signals are all honoured", () => {
    const r = hireRelevance({ hiring_signals: ["Hiring RevOps", "Hiring Data team"] });
    expect(r.isRelevant("Revenue Operations Manager")).toBe(true);
    expect(r.isRelevant("Analytics Engineer")).toBe(true);
    expect(r.isRelevant("Customer Success Manager")).toBe(false);
  });

  it("punctuation in the option text does not matter", () => {
    // Matched on normalized text, so the UI can write it however it likes.
    for (const spelling of ["Hiring SDRs / BDRs", "hiring sdrs/bdrs", "Hiring SDRs  /  BDRs"]) {
      expect(hireRelevance({ hiring_signals: [spelling] }).source, spelling).toBe("icp_hiring_signals");
    }
  });

  it("falls back to target titles when no hiring signals are set", () => {
    const r = hireRelevance({ target_titles: ["VP of Engineering", "Head of Data"] });
    expect(r.source).toBe("icp_target_titles");
    expect(r.isRelevant("VP of Engineering")).toBe(true);
    expect(r.isRelevant("Head of Data, Europe")).toBe(true);
    expect(r.isRelevant("Account Executive")).toBe(false);
  });

  it("a target title is matched as a phrase, not a loose substring", () => {
    /*
     * The over-matching the default regex is already prone to. A seller
     * targeting "VP of Sales" should not have every posting containing the
     * word "sales" count as their signal.
     */
    const r = hireRelevance({ target_titles: ["VP of Sales"] });
    expect(r.isRelevant("VP of Sales")).toBe(true);
    expect(r.isRelevant("Sales Development Representative")).toBe(false);

    /*
     * The case above does not actually exercise the boundary — "VP of Sales"
     * is not a substring of the SDR title either way, so it passed with the
     * boundaries removed. These two do: the posting CONTAINS the target title
     * as raw characters and must still not match.
     */
    const data = hireRelevance({ target_titles: ["Data"] });
    expect(data.isRelevant("Data Engineer")).toBe(true);
    expect(data.isRelevant("Database Administrator"), "Database is not a Data role").toBe(false);

    const ops = hireRelevance({ target_titles: ["Ops"] });
    expect(ops.isRelevant("Ops Manager")).toBe(true);
    expect(ops.isRelevant("DevOps Engineer"), "DevOps is not an Ops role").toBe(false);
  });

  it("a title ending in punctuation still matches", () => {
    /*
     * `\b` marks a word/non-word transition, so `\b...\b` around a title
     * that ends in punctuation can never match: after the closing paren there
     * is no word character for the boundary to sit against. Titles are
     * user-typed, so this happens — and it fails in the worst way, with the
     * seller's own target title matching no posting at all.
     */
    const r = hireRelevance({ target_titles: ["Engineer (C++)"] });
    expect(() => r.isRelevant("Senior Engineer (C++)")).not.toThrow();
    expect(r.isRelevant("Senior Engineer (C++)")).toBe(true);
  });

  it("a title starting with punctuation still matches", () => {
    // The same defect on the other side: a leading `\b` before "." is dead.
    const r = hireRelevance({ target_titles: [".NET Developer"] });
    expect(r.isRelevant("Senior .NET Developer")).toBe(true);
    const plus = hireRelevance({ target_titles: ["+1 Growth Lead"] });
    expect(plus.isRelevant("Hiring a +1 Growth Lead")).toBe(true);
  });

  it("hiring signals win over target titles when both are set", () => {
    const r = hireRelevance({
      hiring_signals: ["Hiring Engineers (scaling)"],
      target_titles: ["Chief Financial Officer"],
    });
    expect(r.source).toBe("icp_hiring_signals");
    expect(r.isRelevant("Backend Engineer")).toBe(true);
    expect(r.isRelevant("Chief Financial Officer")).toBe(false);
  });

  it("with no ICP at all, behaviour is exactly what it was", () => {
    /*
     * Most important compatibility case: a user who has filled in neither
     * field must see today's answers, not a narrower set.
     */
    for (const icp of [null, undefined, {}, { hiring_signals: [], target_titles: [] }]) {
      const r = hireRelevance(icp);
      expect(r.source).toBe("default");
      expect(r.isRelevant("Account Executive")).toBe(true);
      expect(r.isRelevant("Head of Growth")).toBe(true);
      expect(r.isRelevant("Staff Nurse")).toBe(false);
    }
  });

  it("junk in the jsonb column is ignored rather than trusted", () => {
    // These are jsonb columns; they can hold anything.
    expect(hireRelevance({ hiring_signals: "Hiring AEs" }).source).toBe("default");
    expect(hireRelevance({ hiring_signals: [null, 7, ""] }).source).toBe("default");
    expect(hireRelevance({ target_titles: [{ x: 1 }] }).source).toBe("default");
  });

  it("an unrecognised hiring signal does not silently narrow the rule", () => {
    /*
     * An option in the UI with no pattern here would otherwise mean "nothing
     * is relevant", which looks exactly like a company that is not hiring.
     * Unmapped options contribute nothing, so with none mapped it falls back
     * rather than matching zero postings.
     */
    const r = hireRelevance({ hiring_signals: ["Hiring Interpretive Dancers"] });
    expect(r.source).toBe("default");
    expect(r.isRelevant("Account Executive")).toBe(true);
  });

  it("every option the ICP page offers has a pattern", () => {
    /*
     * Read out of the page rather than copied, so adding an option to the
     * MultiSelect without a pattern fails here instead of quietly doing
     * nothing for whoever picks it.
     */
    const block = ICP_PAGE.slice(
      ICP_PAGE.indexOf("const HIRING_SIGNAL_OPTIONS"),
      ICP_PAGE.indexOf("];", ICP_PAGE.indexOf("const HIRING_SIGNAL_OPTIONS")),
    );
    const options = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(options.length, "found no options in ICP.tsx").toBeGreaterThanOrEqual(10);

    const mapped = new Set(HIRING_SIGNAL_TITLE_PATTERNS.map((p) => p.option));
    const unmapped = options.filter((o) => !mapped.has(o));
    expect(unmapped, "these ICP options would match nothing").toEqual([]);
  });

  it("every pattern matches the kind of role its option names", () => {
    // A pattern that matches nothing is the same defect one level down.
    const SAMPLES: Record<string, string> = {
      "Hiring SDRs / BDRs": "Sales Development Representative",
      "Hiring AEs": "Account Executive",
      "Hiring Head of Sales / VP Sales": "VP of Sales",
      "Hiring RevOps": "Revenue Operations Lead",
      "Hiring Marketing Ops": "Marketing Operations Manager",
      "Hiring Customer Success": "Customer Success Manager",
      "Hiring Engineers (scaling)": "Senior Backend Engineer",
      "Hiring Data team": "Data Scientist",
      "Hiring Founding [role]": "Founding Account Executive",
      "Hiring Security / Compliance": "Security Engineer",
    };
    for (const { option, titles } of HIRING_SIGNAL_TITLE_PATTERNS) {
      const sample = SAMPLES[option];
      expect(sample, `no sample role for "${option}"`).toBeTruthy();
      expect(titles.test(sample), `"${option}" does not match "${sample}"`).toBe(true);
    }
  });

  it("the default regex is the old one, unchanged", () => {
    expect(DEFAULT_GTM_RE.test("Account Executive")).toBe(true);
    expect(DEFAULT_GTM_RE.test("RevOps Manager")).toBe(true);
    expect(DEFAULT_GTM_RE.test("Backend Engineer")).toBe(false);
  });
});

describe("the detector asks the ICP", () => {
  it("loads the profile and uses the matcher", () => {
    expect(DETECTOR).toContain('.from("icp_profiles")');
    expect(DETECTOR).toContain("hireRelevance(icp)");
    expect(DETECTOR).toContain("relevance.isRelevant(j.title)");
    // The hardcoded regex is gone from the detector.
    expect(DETECTOR).not.toContain("const GTM_RE");
  });

  it("picks the profile deterministically", () => {
    /*
     * Relevance decides signal_type, which is embedded in the dedupe key. A
     * user with several profiles getting whichever row came back first would
     * re-signal the same job board on every poll.
     */
    expect(DETECTOR).toContain('.order("updated_at", { ascending: false })');
  });

  it("records what the decision was based on", () => {
    // "Why is this scored 30" should be answerable from the row.
    expect(DETECTOR).toContain("relevance_source: relevance.source");
    expect(DETECTOR).toContain("relevance_basis: relevance.describe()");
  });
});
