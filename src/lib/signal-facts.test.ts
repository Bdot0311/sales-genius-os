import { describe, expect, it, vi, afterEach } from "vitest";
import {
  signalEventToFact,
  toSignalFacts,
  whenPhrase,
} from "../../supabase/functions/_shared/signal-facts.ts";
import { readFileSync } from "node:fs";

const RESEARCH = readFileSync(
  new URL("../../supabase/functions/research-lead/index.ts", import.meta.url),
  "utf8",
);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
afterEach(() => vi.useRealTimers());

/**
 * Research read the prospect's own website: static marketing copy, identical
 * for every visitor, carrying no timing. It can support "they sell payroll to
 * SMBs" and never "you posted this role three weeks ago" — which is the thing a
 * reply is actually built on, and which the detectors were already finding.
 */
describe("rendering a detected event as something a rep could say", () => {
  it("turns a hiring signal into the role and the scale", () => {
    const f = signalEventToFact({
      signal_type: "hiring_surge",
      occurred_at: daysAgo(15),
      source: "ats:greenhouse",
      metadata: { top_role: "Head of Growth", top_role_url: "https://x.com/jobs/1", open_roles: 4, gtm_roles: 2 },
    });
    expect(f?.fact).toContain("Head of Growth");
    expect(f?.fact).toContain("4 roles open");
    expect(f?.fact).toContain("2 of them go-to-market");
    expect(f?.source).toBe("https://x.com/jobs/1");
  });

  it("cites the SEC filing for funding", () => {
    const f = signalEventToFact({
      signal_type: "funding_raised",
      occurred_at: daysAgo(30),
      source: "sec:edgar",
      metadata: { filing_name: "Form D", filing_url: "https://sec.gov/x" },
    });
    expect(f?.fact).toContain("Form D");
    expect(f?.source).toBe("https://sec.gov/x");
  });

  it("distinguishes adding a tool from dropping one", () => {
    const added = signalEventToFact({
      signal_type: "tech_stack_change", occurred_at: daysAgo(5), source: "tech:bloomberry",
      metadata: { product: "Segment", category: "CDP", change: "added" },
    });
    const dropped = signalEventToFact({
      signal_type: "tech_stack_change", occurred_at: daysAgo(5), source: "tech:bloomberry",
      metadata: { product: "Segment", category: "CDP", change: "removed" },
    });
    expect(added?.fact).toMatch(/^Added Segment/);
    expect(dropped?.fact).toMatch(/^Dropped Segment/);
  });

  it("flags a competitor move, which changes the whole angle", () => {
    const f = signalEventToFact({
      signal_type: "tech_stack_change", occurred_at: daysAgo(5), source: "tech:bloomberry",
      metadata: { product: "Outreach.io", change: "added", competitor: true },
    });
    expect(f?.fact).toContain("competitor");
  });

  it("returns nothing when the metadata cannot support a concrete sentence", () => {
    // "They had a hiring signal" is worse than no signal — it invites exactly
    // the vague opener this exists to replace.
    expect(signalEventToFact({
      signal_type: "hiring_surge", occurred_at: daysAgo(5), source: "ats", metadata: {},
    })).toBeNull();
    expect(signalEventToFact({
      signal_type: "some_future_type", occurred_at: daysAgo(5), source: "x", metadata: {},
    })).toBeNull();
  });
});

describe("saying when, the way a person would", () => {
  it("stays vague enough not to read like surveillance", () => {
    expect(whenPhrase(daysAgo(3))).toBe("in the last week or so");
    expect(whenPhrase(daysAgo(15))).toBe("a couple of weeks ago");
    expect(whenPhrase(daysAgo(40))).toBe("in the last month");
    // Never "47 days ago".
    expect(whenPhrase(daysAgo(47))).not.toMatch(/\d/);
  });

  it("says nothing when the date is unusable", () => {
    expect(whenPhrase(null)).toBe("");
    expect(whenPhrase("not-a-date")).toBe("");
  });
});

describe("choosing which events to use", () => {
  it("drops events too old to open on", () => {
    // "I noticed you just..." stops being true.
    const facts = toSignalFacts([{
      signal_type: "funding_raised", occurred_at: daysAgo(400), source: "sec",
      metadata: { filing_name: "Form D" },
    }]);
    expect(facts).toHaveLength(0);
  });

  it("keeps one per type, newest first", () => {
    // Three hiring events say one thing to a reader; listing them reads like a
    // dossier rather than a note from a person.
    const facts = toSignalFacts([
      { signal_type: "hiring_surge", occurred_at: daysAgo(30), source: "ats", metadata: { top_role: "SDR" } },
      { signal_type: "hiring_surge", occurred_at: daysAgo(3), source: "ats", metadata: { top_role: "Head of Growth" } },
      { signal_type: "funding_raised", occurred_at: daysAgo(10), source: "sec", metadata: { filing_name: "Form D" } },
    ]);
    expect(facts).toHaveLength(2);
    expect(facts[0].fact).toContain("Head of Growth");
  });
});

describe("the brief actually carries them", () => {
  it("loads the lead's detected events", () => {
    expect(RESEARCH).toContain('.from("signal_events")');
    expect(RESEARCH).toContain("toSignalFacts");
  });

  it("merges them in rather than asking the model to repeat them", () => {
    // The model has already demonstrated it will write around evidence it is
    // handed; routing verified events through it could only lose them.
    expect(RESEARCH).toMatch(/\.\.\.signalFacts\.map\(\(f\) => \(\{\s*fact: f\.fact,/);
    // And the event's own date survives the merge — without it a verified,
    // dated event is indistinguishable from an undated line off an About page.
    expect(RESEARCH).toContain("occurred: normalizeOccurred(f.occurred_at");
  });

  it("puts them ahead of website observations", () => {
    const merged = RESEARCH.indexOf("const mergedObservations");
    const signalsFirst = RESEARCH.indexOf("...signalFacts.map(", merged);
    const modelSecond = RESEARCH.indexOf("...modelObservations", merged);
    expect(signalsFirst).toBeLessThan(modelSecond);
  });

  it("records where each event came from", () => {
    expect(RESEARCH).toContain("...signalFacts.map((f) => f.source)");
  });

  it("does not let a thin website downgrade a dated event", () => {
    expect(RESEARCH).toContain('signalFacts.length ? "high" : "medium"');
  });
});

describe("the signal types the detectors ACTUALLY write", () => {
  /*
   * This file's own first test renders `hiring_surge`, and passes. Nothing in
   * the product has ever written that value.
   *
   * `detect-hiring-signals/index.ts:142` writes `hiring_gtm` or
   * `hiring_growth`. The renderer's cases were `hiring_surge` and `hiring`,
   * neither of which exists, so every hiring event fell to `default:`, which
   * needs `metadata.headline` — and the hiring detector's metadata has no
   * headline. It returned null. Every one.
   *
   * So hiring scored into intent (Lead Score v2 reads the stored weight) and
   * reached the copy never, which is the exact failure `signal-facts.ts` was
   * written to fix. Its header says so: "All of that drove the intent SCORE
   * and none of it reached the COPY." Still true for the highest-weight
   * signal in the product, because the test that was supposed to cover it
   * made up its input.
   *
   * These assert against the strings the detector emits. Values, not names
   * that read plausibly.
   */
  const HIRING_META = {
    top_role: "Head of Growth",
    top_role_url: "https://boards.greenhouse.io/acme/jobs/1",
    open_roles: 4,
    gtm_roles: 2,
  };

  it("hiring_gtm renders, because that is what the detector writes", () => {
    const f = signalEventToFact({
      signal_type: "hiring_gtm",
      occurred_at: daysAgo(15),
      source: "ats:greenhouse",
      metadata: HIRING_META,
    });
    expect(f, "hiring_gtm produced no fact at all").not.toBeNull();
    expect(f?.fact).toContain("Head of Growth");
    expect(f?.fact).toContain("4 roles open");
    expect(f?.source).toBe("https://boards.greenhouse.io/acme/jobs/1");
  });

  it("hiring_growth renders too", () => {
    const f = signalEventToFact({
      signal_type: "hiring_growth",
      occurred_at: daysAgo(20),
      source: "ats:lever",
      metadata: { top_role: "Backend Engineer", open_roles: 2, gtm_roles: 0 },
    });
    expect(f, "hiring_growth produced no fact at all").not.toBeNull();
    expect(f?.fact).toContain("Backend Engineer");
    // No GTM roles, so that clause must not appear claiming zero.
    expect(f?.fact).not.toContain("go-to-market");
  });

  it("every signal_type a detector writes can produce a fact", () => {
    /*
     * The guard that would have caught this. It reads the detectors for the
     * values they actually insert, rather than trusting a list kept by hand,
     * and requires each one to render.
     *
     * The first version of this passed while the bug was live. It handed every
     * type one bag of "generous" metadata that happened to include a
     * `headline`, so a type the switch does not know fell to `default:`, found
     * the headline and returned a fact. The sweep proved the fallback works,
     * which was never in question, and said nothing about the dispatch.
     *
     * Each type now gets only metadata its own branch would really see, and
     * none of them carry a headline except news. A type the switch does not
     * handle now reaches `default:`, finds nothing, and returns null — which
     * is the production behaviour this is meant to detect.
     */
    const META_BY_TYPE: Record<string, Record<string, unknown>> = {
      hiring_gtm: HIRING_META,
      hiring_growth: HIRING_META,
      hiring_surge: HIRING_META,
      tech_stack_change: { product: "Segment", change: "added", source_url: "https://example.com/x" },
      funding_raised: { filing_name: "Form D", filing_url: "https://sec.gov/x" },
    };

    const DETECTORS = [
      "detect-hiring-signals",
      "detect-tech-signals",
      "detect-funding-signals",
    ];
    const written = new Set<string>();
    for (const d of DETECTORS) {
      const src = readFileSync(
        new URL(`../../supabase/functions/${d}/index.ts`, import.meta.url),
        "utf8",
      );
      // Literal inserts: `signal_type: "tech_stack_change"`.
      for (const m of src.matchAll(/signal_type:\s*"([a-z_]+)"/g)) written.add(m[1]);
      // And the ternary the hiring detector uses to pick between two.
      for (const m of src.matchAll(/=\s*isGtm\s*\?\s*"([a-z_]+)"\s*:\s*"([a-z_]+)"/g)) {
        written.add(m[1]);
        written.add(m[2]);
      }
    }
    // If this stops finding them, the loop below proves nothing.
    expect(written.size, "found no signal types in the detectors").toBeGreaterThanOrEqual(4);
    expect(written, "the hiring types are the ones this was written for").toContain("hiring_gtm");

    // A new detector has to say how its signal reads, here, rather than
    // discovering months later that it never reached an email.
    const unmapped = [...written].filter((t) => !(t in META_BY_TYPE));
    expect(unmapped, "new signal types: decide how each one renders").toEqual([]);

    const dropped = [...written].filter(
      (t) => signalEventToFact({
        signal_type: t,
        occurred_at: daysAgo(10),
        source: "x",
        metadata: META_BY_TYPE[t],
      }) === null,
    );
    expect(dropped, "these are collected and scored but never reach the copy").toEqual([]);
  });
});
