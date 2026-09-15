import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const AGENT = readFileSync("src/pages/Agent.tsx", "utf8");
const ICP = readFileSync("src/pages/ICP.tsx", "utf8");
const OUTREACH = readFileSync("src/pages/Outreach.tsx", "utf8");
const PANEL = readFileSync("src/components/dashboard/Panel.tsx", "utf8");

describe("the ai agent", () => {
  it("does not open with six numbers under six differently coloured icons", () => {
    // Cyan, indigo, blue, purple, green and orange turned six unrelated counts
    // into a legend, and made the brightest thing on the page a set of squares.
    expect(AGENT).not.toContain("bg-cyan-500/10");
    expect(AGENT).not.toContain("bg-indigo-500/10");
    expect(AGENT).not.toContain("bg-purple-500/10");
    expect(AGENT).not.toContain("const statCards");
    expect(AGENT).toContain("<MetricStrip metrics={metrics} columns={5} />");
  });

  it("says what each number means", () => {
    expect(AGENT).toContain("Sourced today against your ICP");
    expect(AGENT).toContain("Conversations still open");
  });

  it("does not print when the agent last ran twice over", () => {
    // It was one of the six tiles and also a line in the status bar above them.
    expect(AGENT.match(/Last run/g) ?? []).toHaveLength(1);
  });

  it("the switch sits beside the word that says whether it is on", () => {
    // The switch was in the page header and the state was in a bar below it.
    expect(AGENT).toContain('isEnabled ? "Running" : "Stopped"');
    expect(AGENT.indexOf("<Switch")).toBeGreaterThan(AGENT.indexOf("<PanelHeader"));
  });

  it("identity, permissions and allowances are one surface", () => {
    expect(AGENT).not.toMatch(/<Card\b/);
    expect(AGENT).toContain("<PanelFooter");
    expect(AGENT).toContain("What it may do on its own");
  });

  it("the unconfigured notice takes you to the tab that fixes it", () => {
    // It named the tab and left you to find it.
    expect(AGENT).toContain('setTab("configuration")');
    expect(AGENT).toContain("<Tabs value={tab} onValueChange={setTab}");
    expect(AGENT).not.toContain("border-dashed border-2 border-primary/20");
  });
});

describe("the icp list", () => {
  it("is rows, not a grid of cards", () => {
    // Each profile was a card with a coloured completion badge, a row of filled
    // badges, a row of outlined badges and a full-width button — so the
    // heaviest element on the page repeated once per profile.
    expect(ICP).not.toMatch(/<Card\b/);
    expect(ICP).toContain("<Panel>");
    expect(ICP).toContain("<PanelHeader");
  });

  it("describes a profile in prose rather than in badges", () => {
    expect(ICP).toContain('targets.join(" · ")');
    expect(ICP).not.toContain('<Badge key={i} variant="secondary" className="text-xs">');
  });

  it("completion is a measure, not a traffic light", () => {
    // Red, amber and green said bad, medium and good about a profile that is
    // simply unfinished, and carried no more information than the number.
    expect(ICP).not.toContain('score >= 70 ? "text-green-500');
    expect(ICP).toContain("% filled");
  });

  it("has one button for creating an ICP, not two doing the same thing", () => {
    // The editor sheet's own heading is a different string, so this counts the
    // button's label rather than the words.
    expect(ICP.match(/\/>New ICP\b/g) ?? []).toHaveLength(1);
  });

  it("the row opens the editor without a button nested inside a clickable card", () => {
    expect(ICP).not.toContain('cursor-pointer" onClick={() => openEdit(p)}');
    expect(ICP).toContain("onClick={() => openEdit(p)}");
  });
});

describe("outreach studio", () => {
  it("puts its controls in the header's own slot", () => {
    // They sat in a flex bar underneath whose only job was to right-align them,
    // while the header's actions slot went unused.
    expect(OUTREACH).not.toContain("sm:items-center justify-end gap-4");
    expect(OUTREACH).toContain("<BulkSendDialog");
    expect(OUTREACH.indexOf("<BulkSendDialog")).toBeLessThan(OUTREACH.indexOf('<div className="space-y-4 pt-4">'));
  });

  it("uses the dashboard's surface for its panes", () => {
    expect(OUTREACH).not.toMatch(/<Card\b/);
    expect(OUTREACH).toContain('<PanelHeader title="Generated email" />');
    expect(OUTREACH).toContain('<PanelHeader title="Sent emails"');
  });

  it("due follow-ups are one panel, not one tinted slab each", () => {
    expect(OUTREACH).not.toContain("border-amber-500/30 bg-amber-500/5 text-sm");
    expect(OUTREACH).toContain('title="Follow-ups due"');
    expect(OUTREACH).toContain("${dueFollowUps.length} waiting");
  });
});

/**
 * Tailwind's 50/100/200 shades are near-white. Nothing in this product ever
 * renders on a light background — the theme is dark and `darkMode: class` never
 * gets its class — so a slab painted in one is a glaring white box, usually
 * with amber-400 or emerald-400 text on it that cannot be read.
 */
describe("no light-mode surfaces survive in the app", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => `${dir}/${f}`);

  const files = [...walk("src/pages"), ...walk("src/components")].filter(
    (f) =>
      !/\/(landing|seo)\//.test(f) &&
      !/(Index|Blog|BlogPost|Pricing|Partners|HelpCenter|ApiDocs|ApiStatus|DemoPage|Terms|Privacy|Security|Accessibility|Install|RequestIntegration|Checkout|Confirmation|OAuthConsent|Onboarding|Auth|SalesOSLanding|SalesOperationsSoftware|AiSdrAgent|ApolloAlternative|Vs[A-Z]\w+)\.tsx$/.test(f),
  );

  it("finds none", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // bg-white on the email preview is deliberate: it is a picture of what
      // the recipient sees in their own mail client.
      for (const m of src.matchAll(/\b(?:bg|border)-(?:amber|yellow|red|green|blue|orange|slate|gray|zinc|neutral|stone)-(?:50|100|200)\b/g)) {
        offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the metric strip", () => {
  it("never builds a column class by interpolation", () => {
    // Tailwind ships only the classes it can see in the source, so a class name
    // assembled from a count compiles to no CSS and the strip stays 2-up.
    expect(PANEL).toContain('{ 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[columns]');
    expect(PANEL).not.toMatch(/grid-cols-\$\{/);
  });
});
