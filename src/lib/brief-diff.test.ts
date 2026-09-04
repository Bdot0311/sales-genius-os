import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  changesPromptLines,
  diffBriefs,
  sameFact,
} from "../../supabase/functions/_shared/brief-diff.ts";
import { briefToPromptBlock, type LeadResearchBrief } from "../../supabase/functions/_shared/lead-research.ts";

const NOW = new Date("2026-09-04T00:00:00Z");
const obs = (...facts: string[]) => ({ observations: facts.map((fact) => ({ fact })) });

/**
 * A cold open lives or dies on "why are you writing to me today". A plain
 * observation cannot answer that — a website is a standing document, so
 * "you position around compliance" was equally true last year. A DIFFERENCE
 * answers it by construction, and every brief was already stored on the lead.
 * The comparison was simply never made.
 */

describe("the same fact, worded differently, is the same fact", () => {
  it("matches a rephrasing", () => {
    expect(sameFact(
      "They launched an enterprise pricing tier",
      "An enterprise tier was added to their pricing",
    )).toBe(true);
  });

  it("matches a terse version against a longer restatement", () => {
    expect(sameFact(
      "Hiring a Head of Growth",
      "They are currently hiring for a Head of Growth role in New York",
    )).toBe(true);
  });

  it("does not match two unrelated facts", () => {
    expect(sameFact(
      "They launched an enterprise pricing tier",
      "Their careers page lists three open engineering roles",
    )).toBe(false);
  });

  it("does not match on stop words alone", () => {
    expect(sameFact("They are the ones who help you", "They have it and use it")).toBe(false);
  });

  it("treats an empty side as no match rather than a match", () => {
    expect(sameFact("", "anything at all here")).toBe(false);
  });
});

describe("what changed between two looks", () => {
  it("reports a fact that appeared", () => {
    const d = diffBriefs(obs("Sells to mid-market ops teams"), obs("Sells to mid-market ops teams", "Launched an enterprise tier"), { previousAt: "2026-08-14T00:00:00Z", now: NOW });
    expect(d?.added).toEqual(["Launched an enterprise tier"]);
    expect(d?.removed).toEqual([]);
    expect(d?.days).toBe(21);
  });

  it("reports a fact that disappeared", () => {
    // The half nobody instruments. A pricing tier that vanished or a job
    // posting that closed is a real event at that account, and it shows up
    // nowhere in a fresh scrape.
    const d = diffBriefs(obs("Hiring a Head of Growth", "Sells to ops teams"), obs("Sells to ops teams"), { previousAt: "2026-09-01T00:00:00Z", now: NOW });
    expect(d?.removed).toEqual(["Hiring a Head of Growth"]);
    expect(d?.added).toEqual([]);
  });

  it("says nothing when the brief only got reworded", () => {
    // The brief is model-written, so the same facts come back differently
    // phrased every scrape. A literal comparison would report the whole brief
    // as new every time — manufacturing a "they just changed this" opener for
    // a page that has not moved in two years.
    const d = diffBriefs(
      obs("They launched an enterprise pricing tier"),
      obs("An enterprise tier was added to their pricing"),
      { previousAt: "2026-08-14T00:00:00Z", now: NOW },
    );
    expect(d).toBeNull();
  });

  it("says nothing on the first look at an account", () => {
    // Never having looked before is not news about the prospect.
    expect(diffBriefs(null, obs("Launched an enterprise tier"), { now: NOW })).toBeNull();
    expect(diffBriefs(obs(), obs("Launched an enterprise tier"), { now: NOW })).toBeNull();
  });

  it("copes with no previous timestamp", () => {
    const d = diffBriefs(obs("old fact about widgets"), obs("brand new thing entirely"), { now: NOW });
    expect(d?.days).toBeNull();
  });

  it("caps how much it will report", () => {
    const many = Array.from({ length: 9 }, (_, i) => `distinct finding number ${i} about tooling`);
    const d = diffBriefs(obs("a completely unrelated baseline fact"), obs(...many), { now: NOW });
    expect(d!.added.length).toBeLessThanOrEqual(5);
  });
});

describe("how a change is put to the writer", () => {
  const changes = diffBriefs(
    obs("Sells to ops teams"),
    obs("Sells to ops teams", "Launched an enterprise tier"),
    { previousAt: "2026-08-28T00:00:00Z", now: NOW },
  );

  it("states the window it is certain about", () => {
    expect(changesPromptLines(changes).join("\n")).toContain("in the last 7 days");
  });

  it("forbids overclaiming the timing", () => {
    // All that is known is that it appeared between two scrapes, which may be
    // a fortnight apart. "You launched this last week" is not supported.
    const text = changesPromptLines(changes).join("\n");
    expect(text).toMatch(/may NOT say exactly when it happened/);
    expect(text).toMatch(/name a date/);
  });

  it("tells the writer to lead with it", () => {
    expect(changesPromptLines(changes).join("\n")).toMatch(/Lead with one of them/);
  });

  it("says nothing at all when there is no diff", () => {
    expect(changesPromptLines(null)).toEqual([]);
  });
});

describe("the prompt block puts the change first", () => {
  const brief: LeadResearchBrief = {
    what_they_do: "Field service software",
    who_they_sell_to: "Facilities teams",
    observations: [{ fact: "Sells to facilities teams", source: "https://acme.io", occurred: "" }],
    hooks: ["their onboarding claim"],
    avoid: [],
    confidence: "medium",
    changes: { added: ["Launched an enterprise tier"], removed: [], since: "2026-08-28T00:00:00Z", days: 7 },
  };

  it("leads on it, above what they do", () => {
    const block = briefToPromptBlock(brief, ["https://acme.io"]);
    expect(block.indexOf("Launched an enterprise tier")).toBeLessThan(block.indexOf("What they do"));
  });

  it("drops the blanket no-timing warning, which a diff contradicts", () => {
    // The observation itself is undated, so without this the block would
    // simultaneously say "lead on this recent change" and "make no time
    // claim" — and the suppression would win.
    expect(briefToPromptBlock(brief, [])).not.toContain("Do NOT open with a time claim");
  });

  it("keeps the warning when there is no change to lead on", () => {
    const { changes: _dropped, ...noChanges } = brief;
    expect(briefToPromptBlock(noChanges as LeadResearchBrief, [])).toContain("Do NOT open with a time claim");
  });
});

describe("the diff is computed against the brief being replaced", () => {
  const SRC = readFileSync("supabase/functions/research-lead/index.ts", "utf8");

  it("compares the stored brief with the new one before the write", () => {
    const diffAt = SRC.indexOf("const changes = diffBriefs(");
    const writeAt = SRC.indexOf("research_brief: brief,");
    expect(diffAt).toBeGreaterThan(-1);
    expect(diffAt).toBeLessThan(writeAt);
    expect(SRC).toContain("lead.research_brief ?? null");
  });

  it("dates the window from when that brief was taken", () => {
    expect(SRC).toContain("previousAt: (lead.researched_at as string | null) ?? null");
  });

  it("rides inside the brief JSON, so no migration can lag the code", () => {
    // A new column is only live once Lovable applies the migration; code that
    // reads it before then 500s. research_brief is already jsonb.
    expect(SRC).toContain("quality, changes };");
    const MIGRATIONS = readFileSync("supabase/migrations/20260904180000_allow_custom_sequence_trigger.sql", "utf8");
    expect(MIGRATIONS).not.toContain("research_changes");
  });
});
