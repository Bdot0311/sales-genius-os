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
 * It also narrated its own progress while the results region narrated the same
 * thing directly underneath, so one search rendered two spinners.
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

  it("is no longer a card, so the results card is not a card inside a card", () => {
    expect(CMD).not.toMatch(/<Card\b/);
  });
});

describe("one search, one loading state", () => {
  it("the command box no longer narrates the search", () => {
    expect(CMD).not.toContain("Searching B2B data sources");
  });

  it("the results region shows skeletons in the shape of results", () => {
    expect(PAGE).toContain("Searching for leads");
    expect(PAGE).toContain("<Skeleton");
    // a spinner in a void is what the skeletons replaced
    expect(PAGE).not.toContain("Searching B2B data sources");
  });
});

describe("mobile", () => {
  it("the examples stay on one scrolling row", () => {
    // They are whole sentences. flex-wrap gave each its own full-width pill at
    // phone width and wrapped the longest onto two lines, so four suggestions
    // took more room than the search they suggest for.
    expect(CMD).toContain("overflow-x-auto");
    expect(CMD).toContain("whitespace-nowrap");
    expect(CMD).not.toContain('className="flex flex-wrap gap-1.5"');
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

  it("the input does not trigger iOS zoom on focus", () => {
    // Anything under 16px makes Safari zoom the page when the field is focused.
    expect(CMD).toContain("text-base");
  });

  it("the tabs scroll rather than wrapping into a 2x2 block", () => {
    expect(PAGE).toContain("overflow-x-auto");
    expect(PAGE).not.toContain('className="mb-4 flex flex-wrap h-auto"');
  });
});

describe("the input is still a labelled control", () => {
  it("carries an accessible name even though the label is visual placeholder only", () => {
    expect(CMD).toContain('aria-label="Describe the leads you are looking for"');
  });
});
