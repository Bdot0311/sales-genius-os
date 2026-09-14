import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ACCOUNTS = readFileSync("src/pages/Accounts.tsx", "utf8");
const PIPELINE = readFileSync("src/pages/Pipeline.tsx", "utf8");
const DELIVERABILITY = readFileSync("src/pages/Deliverability.tsx", "utf8");

/**
 * The second batch of pages moved onto the shared surfaces in Panel.tsx.
 *
 * The point of the exercise is that no two pages should be solving the same
 * layout problem differently, so these check the specific disagreements each
 * page had with the rest of the product — not that it looks nice.
 */
describe("accounts", () => {
  it("the list is a panel with a header, not a bare card of rows", () => {
    expect(ACCOUNTS).toContain("<Panel");
    expect(ACCOUNTS).toContain("<PanelHeader");
    expect(ACCOUNTS).not.toMatch(/<Card\b/);
  });

  it("is written in sentence case like the rest of the dashboard", () => {
    // It was the one page whose copy ran in lower case throughout, which reads
    // as unfinished rather than as a style.
    expect(ACCOUNTS).not.toContain("loading accounts...");
    expect(ACCOUNTS).not.toContain("no accounts yet.");
    expect(ACCOUNTS).not.toContain("pick an account to see its committee.");
    expect(ACCOUNTS).toContain("Loading accounts…");
  });

  it("the empty right-hand side teaches what an account shows", () => {
    expect(ACCOUNTS).toContain("Pick an account");
    expect(ACCOUNTS).toContain("buying committee you have contacts for");
  });
});

describe("pipeline", () => {
  it("stage colour is one progression, not seven hues", () => {
    // Seven saturated colours read as seven unrelated categories, which is the
    // opposite of what a pipeline is.
    for (const hue of ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-yellow-500", "bg-orange-500"]) {
      expect(PIPELINE, hue).not.toContain(hue);
    }
    expect(PIPELINE).toContain("bg-primary/25");
    expect(PIPELINE).toContain("bg-primary/85");
  });

  it("carries no gradient button", () => {
    expect(PIPELINE).not.toContain('variant="hero"');
  });

  it("the empty state replaces the board instead of sitting under it", () => {
    // Seven empty columns followed by "no deals yet" is the page saying it
    // twice, the second time from below the fold.
    expect(PIPELINE).toContain("{!loading && deals.length === 0 ? (");
    expect(PIPELINE).not.toContain("Create First Deal");
  });

  it("totals the board it is a board of", () => {
    expect(PIPELINE).toContain("<MetricStrip metrics={summary} />");
    expect(PIPELINE).toContain("const openValue");
    expect(PIPELINE).toContain("const weighted");
  });

  it("does not hand out the forecasting feature for free", () => {
    // Weighted pipeline IS the gated feature. Showing it unconditionally would
    // have given every plan the thing the Forecast button upsells.
    expect(PIPELINE).toContain("features.revenueForecasting\n      ? { label: \"Weighted\"");
    expect(PIPELINE).toContain('{ label: "Closed lost"');
  });

  it("does not compute a forecast into a toast", () => {
    // A toast is where numbers go to be dismissed three seconds later and
    // recomputed on the next click.
    expect(PIPELINE).not.toContain('title: "Revenue Forecast"');
  });

  it("the upsell is last and quiet", () => {
    expect(PIPELINE).not.toContain("border-dashed border-primary/30 bg-primary/5");
    expect(PIPELINE.indexOf("automatedStageProgression'")).toBeGreaterThan(PIPELINE.indexOf("<MetricStrip"));
  });
});

describe("deliverability", () => {
  it("uses the shared page header", () => {
    // It hand-rolled an h1 with an icon beside it at a size nothing else in the
    // dashboard uses, which is why it never looked like part of the product.
    expect(DELIVERABILITY).toContain("<PageHeader");
    expect(DELIVERABILITY).not.toContain('text-xl font-bold');
  });

  it("matches every other page's width", () => {
    expect(DELIVERABILITY).toContain('max-w-[1400px]');
    expect(DELIVERABILITY).not.toContain("max-w-5xl");
  });

  it("section labels recede rather than competing with their content", () => {
    // Twelve sections each headed at panel-title weight reads as twelve equally
    // important announcements rather than one page with an order.
    expect(DELIVERABILITY).toContain('text-[0.625rem] font-medium uppercase tracking-[0.1em]');
    expect(DELIVERABILITY).not.toContain('<h2 className="text-sm font-semibold">');
  });

  it("gated and errored states share one shape", () => {
    // Both were centred icon-in-a-circle cards, built separately. This first
    // pinned the name of the local component that unified them, which is the
    // implementation rather than the point — it broke the moment that local
    // one was promoted to the shared EmptyState every page now uses. What
    // matters is that the two states are one shape and neither is a card with
    // an icon in a circle.
    const gated = DELIVERABILITY.slice(DELIVERABILITY.indexOf("{gated ? ("), DELIVERABILITY.indexOf(") : loading ? ("));
    expect(gated.match(/<EmptyState/g) ?? []).toHaveLength(2);
    expect(DELIVERABILITY).not.toMatch(/<Card\b/);
    expect(DELIVERABILITY).not.toContain("rounded-full bg-primary/10");
  });
});

describe("the batch agrees with the primitives", () => {
  it("every page in it imports the shared surfaces", () => {
    for (const [name, src] of [["accounts", ACCOUNTS], ["pipeline", PIPELINE], ["deliverability", DELIVERABILITY]] as const) {
      expect(src, name).toContain('from "@/components/dashboard/Panel"');
    }
  });

  it("none of them still builds its own card", () => {
    for (const [name, src] of [["accounts", ACCOUNTS], ["pipeline", PIPELINE], ["deliverability", DELIVERABILITY]] as const) {
      expect(src, name).not.toMatch(/<Card\b/);
    }
  });
});
