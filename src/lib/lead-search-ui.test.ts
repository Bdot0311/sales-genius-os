import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The lead search page wore a terminal costume: three macOS traffic lights, a
 * filename reading "ai-lead-generator", a "→" prompt and a monospace input.
 * None of it was a terminal — nothing about typing a sentence and pressing a
 * button is terminal-like — so it was decoration impersonating an affordance.
 * PRODUCT.md lists "anything that looks generated, interchangeable, or built
 * without a point of view" as an anti-reference.
 *
 * Stripping the costume was not by itself a design. What it left was one
 * hairline input in an otherwise empty page, and a page that is empty below
 * the fold reads as one that failed to load. These tests guard the structure
 * that replaced it, not the subtraction.
 */
const CMD = readFileSync("src/components/dashboard/AILeadCommand.tsx", "utf8");
const PAGE = readFileSync("src/pages/Leads.tsx", "utf8");

describe("the terminal costume is gone", () => {
  it("has no fake window chrome", () => {
    expect(CMD).not.toContain("bg-destructive/80");
    expect(CMD).not.toContain("bg-yellow-500/80");
    expect(CMD).not.toContain("ai-lead-generator");
  });

  it("has no prompt glyph or monospace input", () => {
    expect(CMD).not.toContain("→");
    expect(CMD).not.toContain("font-mono");
  });

  it("dropped the badge that stated nothing actionable", () => {
    expect(CMD).not.toContain("AI-Powered");
  });
});

describe("one panel, not four stacked cards", () => {
  // Every mode used to render its own Card, each repeating the tab label it
  // sat under as its own heading: three borders and two titles for one
  // control. The tab strip is now the panel's header and the modes render
  // bare, so nothing is a card inside a card.
  for (const file of [
    "src/components/dashboard/AILeadCommand.tsx",
    "src/components/dashboard/DomainICPBuilder.tsx",
    "src/components/dashboard/TargetCompanies.tsx",
    "src/components/dashboard/FindPerson.tsx",
  ]) {
    it(`${file} renders bare`, () => {
      expect(readFileSync(file, "utf8")).not.toMatch(/<Card\b/);
    });
  }

  it("the panel is one bordered surface the tab strip sits inside", () => {
    expect(PAGE).toMatch(/className="[^"]*\boverflow-hidden rounded-xl border border-border\/50 bg-card/);
  });
});

describe("one search, one loading state", () => {
  it("the command box no longer narrates the search", () => {
    expect(CMD).not.toContain("Searching B2B data sources");
  });

  it("the results region shows the search working, not a spinner", () => {
    // The loading state moved into SearchingResults, which reads the criteria
    // back as well; the rows in the results' shape are still what holds the
    // layout. A spinner in a void is what they replaced.
    const waiting = readFileSync("src/components/dashboard/SearchingResults.tsx", "utf8");
    expect(waiting).toContain('aria-label="Searching for leads"');
    // No longer rows in the shape of results: the wait draws the population
    // being narrowed instead, which is the part of this nobody else shows.
    expect(waiting).toContain("animate-sift-lock");
    expect(PAGE).toContain("<SearchingResults");
    expect(PAGE).not.toContain("Searching B2B data sources");
  });

  it("clearing the results is one button, not two doing the same thing", () => {
    // "Start New Search" and "Clear" sat side by side running the identical
    // three setters under different names.
    expect(PAGE).not.toContain("Start New Search");
    expect(PAGE.match(/clearExternalLeads\(\);/g)?.length).toBe(1);
  });
});

describe("the page is not empty below the search", () => {
  it("states what the search does, on the page that does it", () => {
    expect(PAGE).toContain("SEARCH_PRIMER");
    expect(PAGE).toContain("Describe who you want");
    expect(PAGE).toContain("Save the ones worth it");
  });

  it("the primer yields to results rather than sitting under them", () => {
    expect(PAGE).toContain("{!showExternalLeads && (");
  });

  it("shows the allowance on the screen that spends it", () => {
    expect(PAGE).toContain("search credits left");
    expect(PAGE).toContain("credits.remainingCredits.toLocaleString()");
  });
});

describe("mobile", () => {
  it("the mode labels are short enough to fit four across a phone", () => {
    // Scrolling long labels was the previous attempt: the strip sliced the
    // first and last label in half, which reads as broken rather than as
    // scrollable. Every label here is one word.
    const modes = PAGE.slice(PAGE.indexOf("const SEARCH_MODES"), PAGE.indexOf("] as const"));
    const labels = [...modes.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels.length).toBe(4);
    for (const label of labels) {
      expect(label.split(" ").length, label).toBe(1);
      expect(label.length, label).toBeLessThanOrEqual(10);
    }
  });

  it("the examples are a list of short rows, not a strip of cut-off sentences", () => {
    // Full sentences could only ever be chips. Wrapped they became full-width
    // pills taller than the search itself; on one scrolling row they were
    // sliced mid-word at both edges.
    expect(CMD).not.toContain("overflow-x-auto");
    const roles = [...CMD.matchAll(/role: "([^"]+)"/g)].map((m) => m[1]);
    expect(roles.length).toBeGreaterThan(3);
    for (const role of roles) {
      expect(role.length, role).toBeLessThanOrEqual(22);
    }
    // The qualifier is the part allowed to run out of room, and it truncates
    // rather than wrapping the row onto a second line. Matched on the element
    // it belongs to, not on an exact class string, so restyling it is free and
    // dropping the truncation is not.
    expect(CMD).toMatch(/className="truncate[^"]*">\s*\{example\.qualifier\}/);
  });

  it("the submit is inset in the field, not a full-width slab under it", () => {
    // Stacked below the field it was a violet block the size of the input:
    // the largest object on a phone screen, and greyed out most of the time
    // because the field starts empty. It sits on the composer's own control
    // row now, which is where a send button belongs.
    expect(CMD).toMatch(/absolute inset-x-2 bottom-2/);
    expect(CMD).not.toContain("flex flex-col gap-2 sm:flex-row");
  });

  it("takes a sentence, the way a chat box does", () => {
    // A role, a kind of company, a place and usually a couple of exclusions
    // does not fit on one line, and a one-line box hides most of it while it
    // is still being written.
    expect(CMD).toContain("<textarea");
    expect(CMD).toContain("resize-none");
    // Enter searches, Shift + Enter starts a line.
    expect(CMD).toMatch(/e\.key === "Enter" && !e\.shiftKey/);
    // An IME's own Enter must not fire a search mid-word.
    expect(CMD).toContain("isComposing");
    // It grows with what is typed rather than scrolling sideways.
    expect(CMD).toContain("scrollHeight");
  });

  it("has a real type scale rather than one size for everything", () => {
    // Flat type at generous spacing is what made this read as a signup form.
    // The field, the suggestions and the chrome each sit a step apart.
    const sizes = new Set([...CMD.matchAll(/text-\[([\d.]+)rem\]/g)].map((m) => m[1]));
    expect(sizes.size).toBeGreaterThanOrEqual(3);
  });

  it("header actions share rows instead of each taking one", () => {
    // A global rule stacked every page-header action full-width on mobile.
    // Three of them cost a third of the screen before the page began.
    const CSS = readFileSync("src/index.css", "utf8");
    const rule = CSS.slice(CSS.indexOf(".mobile-action-row {"));
    expect(rule.slice(0, 400)).not.toContain("flex-direction: column");
    expect(rule.slice(0, 400)).toContain("flex-wrap: wrap");
    expect(rule.slice(0, 400)).not.toContain("width: 100%");
  });

  it("the header carries no filled button competing with the search", () => {
    // The search is the page's one primary action. A gradient "Add Lead" and a
    // filled "Import Leads" made the two loudest things on the screen the two
    // least likely to be wanted.
    expect(PAGE).toContain('triggerVariant="outline"');
    expect(PAGE).not.toMatch(/<AddLeadDialog(?![^>]*triggerVariant)/);
    expect(PAGE).not.toMatch(/<ImportLeadsDialog(?![^>]*triggerVariant)/);
  });

  it("the input does not trigger iOS zoom on focus", () => {
    // Anything under 16px makes Safari zoom the page when the field is focused.
    expect(CMD).toContain("text-base");
  });
});

describe("the input is still a labelled control", () => {
  it("carries an accessible name even though the label is visual placeholder only", () => {
    expect(CMD).toContain('aria-label="Describe the leads you are looking for"');
  });
});
