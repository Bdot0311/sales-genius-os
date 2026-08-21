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
    expect(RESEARCH).toContain("...signalFacts.map((f) => ({ fact: f.fact, source: f.source }))");
  });

  it("puts them ahead of website observations", () => {
    const merged = RESEARCH.indexOf("const mergedObservations");
    const signalsFirst = RESEARCH.indexOf("...signalFacts.map((f) => ({ fact", merged);
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
