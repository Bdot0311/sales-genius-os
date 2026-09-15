import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const COACH = readFileSync("src/pages/Coach.tsx", "utf8");
const SETTINGS = readFileSync("src/pages/Settings.tsx", "utf8");
const INTEGRATIONS = readFileSync("src/pages/DashboardIntegrations.tsx", "utf8");
const CSS = readFileSync("src/index.css", "utf8");

describe("the coach", () => {
  it("does not open with three cards that disagree about how to draw a number", () => {
    // One used outlined badges and the one beside it solid green, blue and
    // purple ones, which made the three loudest marks on the page a set of
    // colours that meant nothing.
    expect(COACH).not.toMatch(/<Card\b/);
    expect(COACH).not.toContain('<Badge className="bg-green-500">');
    expect(COACH).not.toContain('<Badge className="bg-purple-500">');
    expect(COACH).toContain("<MetricStrip");
  });

  it("stops calling counts objectives", () => {
    // A card titled "Goals", described as "your current objectives", listing
    // how many leads and deals exist.
    expect(COACH).not.toContain("Your current objectives");
  });

  it("has one list of openers and every one is clickable", () => {
    // There were two: four buttons, and a second list of four different
    // questions printed as text you could only read and retype.
    expect(COACH).toContain("const STARTER_QUESTIONS");
    expect(COACH).not.toContain("Example Questions:");
    expect(COACH).not.toContain('<li>• "How do I handle price objections');
  });

  it("the advice is a list rather than paragraphs starting with a bullet glyph", () => {
    expect(COACH).toContain("const focusPoints");
    expect(COACH).toContain("<ul className=\"space-y-1.5\">");
    expect(COACH).not.toContain("<p>• Prepare for");
  });

  it("the allowance sits on the thing that spends it", () => {
    expect(COACH).toContain("<PanelFooter>");
    expect(COACH).toContain("coaching messages used this month");
  });

  it("the composer does not make iOS zoom", () => {
    expect(COACH).toContain("text-base sm:text-[0.8125rem]");
  });
});

describe("settings", () => {
  it("does not open with a wall of navigation", () => {
    // Fifteen triggers forced into a two-column grid built a stack eight rows
    // tall above whatever you had come to change.
    // The override that forced it into a grid is gone; the generic rule that
    // collapses genuinely wide grids on a phone is a different one and stays.
    expect(CSS).not.toContain('[role="tablist"].settings-tab-list {');
    expect(SETTINGS).toContain("lg:grid-cols-[13rem_minmax(0,1fr)]");
    expect(SETTINGS).toContain("lg:flex-col");
    expect(SETTINGS).not.toContain("md:grid-cols-8");
  });

  it("uses the dashboard's surface", () => {
    expect(SETTINGS).not.toMatch(/<Card\b/);
    expect(SETTINGS).toContain("<PanelHeader");
  });

  it("the plan grid can be read across", () => {
    // The recommended column was a gradient slab with a glow and white type,
    // which made it a different product from the ones beside it and made the
    // prices impossible to compare — the one thing a pricing grid is for.
    expect(SETTINGS).not.toContain("bg-gradient-primary border-primary shadow-glow");
    expect(SETTINGS).not.toContain("plan.highlighted ? 'text-white' : ''");
    expect(SETTINGS).toContain("Most picked");
  });

  it("does not print its own tab name back as a heading", () => {
    expect(SETTINGS).not.toContain('<h2 className="text-2xl font-bold">Subscription Plans</h2>');
  });
});

describe("integrations", () => {
  it("puts what is connected first, in its own group", () => {
    // Connected tools were scattered among the ones that were not, because
    // every integration was an identical card in one flat grid.
    expect(INTEGRATIONS).not.toMatch(/<Card\b/);
    expect(INTEGRATIONS).toContain('{ key: "connected", label: "Connected"');
    expect(INTEGRATIONS).toContain('{ key: "available", label: "Available"');
    expect(INTEGRATIONS).not.toContain("grid md:grid-cols-2 lg:grid-cols-3 gap-6");
  });

  it("says a tool is connected once", () => {
    // A green disc pinned to the card corner, a green tick beside each account
    // and the button changing its label were three answers to one question.
    expect(INTEGRATIONS).not.toContain("w-6 h-6 bg-green-500 rounded-full");
  });

  it("does not grow a decorative tile when the cursor passes over it", () => {
    expect(INTEGRATIONS).not.toContain("group-hover:scale-110");
    expect(INTEGRATIONS).not.toContain("hover:shadow-glow");
  });

  it("has no hero buttons, because ten of them is none", () => {
    expect(INTEGRATIONS).not.toContain('variant="hero"\n                      size="sm"');
    expect(INTEGRATIONS).not.toContain('variant={accounts.length > 0 ? "outline" : "hero"}');
  });

  it("the category filter is not the loudest thing on the page", () => {
    expect(INTEGRATIONS).not.toContain('variant={selectedCategory === category ? "default" : "outline"}');
  });
});
