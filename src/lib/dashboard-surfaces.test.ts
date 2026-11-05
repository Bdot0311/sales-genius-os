import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PANEL = readFileSync("src/components/dashboard/Panel.tsx", "utf8");
const OVERVIEW = readFileSync("src/pages/Dashboard.tsx", "utf8");
const TOUR = readFileSync("src/components/dashboard/DashboardTour.tsx", "utf8");

/**
 * Every page built its own surfaces. The same region appeared as a shadcn
 * `Card` on one page, a hand-rolled `rounded-lg border` on the next, and a
 * tinted `border-primary/20 bg-primary/5` box on a third, with padding from p-3
 * to p-6 and type from text-xs to text-2xl for the same job. That is what reads
 * as assembled rather than designed: not any one page being wrong, but no two
 * agreeing.
 */
describe("one set of surfaces, shared", () => {
  it("exports the shapes the lead search settled on", () => {
    for (const name of ["Panel", "PanelHeader", "PanelBody", "PanelFooter", "SplitPanes", "MetricStrip", "SectionLabel"]) {
      expect(PANEL, name).toMatch(new RegExp(`export const ${name}\\b`));
    }
  });

  it("the panel surface is defined once, not per call site", () => {
    expect(PANEL).toContain('const SURFACE = "overflow-hidden rounded-xl border border-border/50 bg-card"');
  });

  it("split regions share one surface instead of floating as cards", () => {
    // Hairlines between, never around: the outer border belongs to the group.
    expect(PANEL).toContain('i > 0 && "border-t border-border/30 sm:border-l sm:border-t-0"');
  });

  it("column counts are written out, not interpolated", () => {
    // Tailwind only ships classes it can see in the source, so a template
    // literal compiles to no CSS at all and the grid silently stays 1-up.
    expect(PANEL).not.toMatch(/grid-cols-\$\{/);
    expect(PANEL).toContain('"sm:grid-cols-2"');
    expect(PANEL).toContain('"sm:grid-cols-3"');
  });

  it("metrics have room to say what they mean", () => {
    // A number with no note is trivia. The space four coloured icons used to
    // take goes to this instead.
    expect(PANEL).toContain("note?: ReactNode");
    expect(PANEL).toContain("{m.note ?");
  });
});

/**
 * The landing page carried three things that were not doing the work they
 * looked like they were doing.
 */
describe("the overview page", () => {
  it("no longer restates the sidebar as a row of cards", () => {
    // "Quick Actions" was three identical icon-chip cards linking to Outreach,
    // Pipeline and Calendar — all of which are in the sidebar, reachable from
    // this page in one click.
    expect(OVERVIEW).not.toContain("Outreach Studio");
    expect(OVERVIEW).not.toContain("View Pipeline");
    expect(OVERVIEW).not.toContain("Schedule Meeting");
  });

  it("no longer calls a restatement an insight", () => {
    // The panel read the four numbers directly above it back as a sentence.
    expect(OVERVIEW).not.toContain("AI Insight");
  });

  it("does not give four unrelated numbers four different hues", () => {
    expect(OVERVIEW).not.toContain("text-blue-400");
    expect(OVERVIEW).not.toContain("text-emerald-400");
    expect(OVERVIEW).not.toContain("text-amber-400");
  });

  it("uses the shared header like every other page", () => {
    // It hand-rolled its own header row, so the one page every user lands on
    // was the one page whose title did not match the rest of the product.
    expect(OVERVIEW).toContain("<PageHeader");
  });

  it("what needs attention is computed from rows, not hardcoded", () => {
    expect(OVERVIEW).toContain("leadsNeverContacted");
    expect(OVERVIEW).toContain("rows.filter((l) => l.contact_email && !l.last_contacted_at).length");
    /*
     * The missing-address counts moved into lead-email-gap.ts when "no email"
     * turned out to be two situations: never enriched, and enriched with no
     * address found. The page must still derive them from the rows it just
     * fetched rather than from a literal, which is what this has always been
     * about.
     */
    expect(OVERVIEW).toContain("countEmailGaps(rows)");
    expect(OVERVIEW).toContain("leadsEnrichedNoEmail: gaps.enriched");
    expect(OVERVIEW).toContain("leadsUnenrichedNoEmail: gaps.unenriched");
  });

  it("an item only appears when the account is actually in that state", () => {
    // An entry that is always present is a link, and links belong in the nav.
    expect(OVERVIEW).toContain("stats.leadsUnenrichedNoEmail > 0 &&");
    expect(OVERVIEW).toContain("stats.leadsEnrichedNoEmail > 0 &&");
    expect(OVERVIEW).toContain("].filter(Boolean)");
  });

  /*
   * A websocket does not survive a backgrounded tab, which on a phone is every
   * time the app is left. Without this the overview showed whatever it loaded
   * on open, indefinitely, with nothing to say the numbers had stopped moving.
   */
  it("reloads when the tab comes back, not only on a realtime event", () => {
    expect(OVERVIEW).toContain('document.addEventListener("visibilitychange"');
    expect(OVERVIEW).toContain('window.addEventListener("focus"');
    expect(OVERVIEW).toContain('document.removeEventListener("visibilitychange"');
    expect(OVERVIEW).toContain('window.removeEventListener("focus"');
  });
});

/**
 * A tour step described a row of cards that no longer exists, and a missing
 * target fell back to a box floating mid-screen pointing at nothing.
 */
describe("the tour follows the page", () => {
  it("does not describe the row that was removed", () => {
    expect(TOUR).not.toContain("Jump straight into outreach, pipeline management, or scheduling");
  });

  it("skips steps whose target is not on the page", () => {
    expect(TOUR).toContain("ALL_STEPS.filter((s) => document.querySelector(s.selector))");
  });

  it("resolves the list and the first step together", () => {
    // setState is not synchronous: filtering in an effect of its own left the
    // opening effect showing the unfiltered first step.
    expect(TOUR).toContain("findTarget(steps[0].selector)");
  });

  it("looks targets up by selector, so the step list can be state", () => {
    expect(TOUR).toContain("const findTarget = useCallback((selector: string) =>");
    expect(TOUR).not.toContain("findTarget = useCallback((step: number)");
  });
});
