import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PANEL = readFileSync("src/components/dashboard/Panel.tsx", "utf8");
const ANALYTICS = readFileSync("src/pages/Analytics.tsx", "utf8");
const PAGES = ["Inbox", "Calendar", "Leads", "ICP", "Deliverability"].map((n) => ({
  name: n,
  src: readFileSync(`src/pages/${n}.tsx`, "utf8"),
}));

/**
 * Analytics was the worst of them: seventeen cards, ten text hues, three
 * centred-icon empty states and a dashed double border, on the page whose whole
 * job is to be read carefully.
 */
describe("analytics", () => {
  it("no longer builds a card per number", () => {
    // The per-metric component was the hero-metric template exactly — big
    // number, small label, an icon in a tinted square — nine of them across the
    // page in nine different hues.
    expect(ANALYTICS).not.toMatch(/<Card\b/);
    expect(ANALYTICS).toContain("<MetricStrip");
  });

  it("dropped the rainbow", () => {
    for (const hue of ["text-blue-500", "text-green-500", "text-yellow-500", "text-pink-500", "text-cyan-500", "text-orange-500", "text-red-500"]) {
      expect(ANALYTICS, hue).not.toContain(hue);
    }
  });

  it("charts state their colours in the design system's terms", () => {
    // Seven raw hex values lifted from a default palette, never checked against
    // this product's near-black ground.
    expect(ANALYTICS).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(ANALYTICS).toContain("const SERIES");
    expect(ANALYTICS).toContain("hsl(var(--primary) / 0.82)");
  });

  it("ordered slices read as a ramp", () => {
    // Pipeline stages are ordered, so seven unrelated colours told the reader
    // they were seven unrelated things.
    const colors = ANALYTICS.slice(ANALYTICS.indexOf("const COLORS = ["), ANALYTICS.indexOf("];", ANALYTICS.indexOf("const COLORS = [")));
    expect(colors).not.toMatch(/#|rgb|text-/);
  });

  it("the benchmark bar and the badge beside it agree", () => {
    // The reader's own bar was green whatever it said, so you could be told
    // "below average" next to a healthy green bar.
    expect(ANALYTICS).not.toContain('className="h-full rounded-full bg-green-500"');
    expect(ANALYTICS).toContain("${getRateStatus(userReplyRate).bar}");
  });

  it("the upsell is not the loudest thing on the page", () => {
    // A dashed double border in the accent colour, spent on a feature the
    // reader does not have.
    expect(ANALYTICS).not.toContain("border-dashed");
  });
});

/**
 * Every page built its own version of the same three states, and they converged
 * on the same shape without ever agreeing on it: a 48px icon, or a 32px icon in
 * a tinted circle, over a heading and a paragraph, on a dashed border or a
 * solid one, at py-8 or py-10 or py-12.
 */
describe("one empty state", () => {
  it("is exported from the shared surfaces", () => {
    expect(PANEL).toContain("export const EmptyState");
  });

  it("carries no icon illustrating the sentence beneath it", () => {
    // A padlock over "this is a Growth feature" and an inbox over "no
    // conversations yet" are decoration standing in for an answer.
    const body = PANEL.slice(PANEL.indexOf("export const EmptyState"), PANEL.indexOf("export const SectionLabel"));
    expect(body).not.toMatch(/<[A-Z]\w+ className="[^"]*h-\d/);
    expect(body).not.toContain("rounded-full");
  });

  for (const page of PAGES) {
    it(`${page.name} uses it`, () => {
      expect(page.src).toContain("EmptyState");
    });
  }

  it("no page still hand-rolls the centred-icon version", () => {
    for (const page of PAGES) {
      expect(page.src, page.name).not.toContain("flex flex-col items-center justify-center py-12");
      expect(page.src, page.name).not.toContain("border-dashed");
    }
  });
});
