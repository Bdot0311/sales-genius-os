import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

/**
 * One surface, everywhere behind the login.
 *
 * The complaint that started this was that the dashboard looked assembled
 * rather than designed, and the cause was never any single page being wrong:
 * it was that no two agreed. The same region appeared as a shadcn Card on one
 * screen, a hand-rolled bordered div on the next and a tinted box on a third,
 * with padding from p-3 to p-6 and headings from 13px to 24px for the same job.
 *
 * Card is not deleted — the marketing site, the auth screens and the help
 * centre are a different design at a different scale and keep it. What this
 * fixes in place is that nothing rendered inside the dashboard reaches for it.
 */

const DASHBOARD_DIRS = [
  "src/components/agent",
  "src/components/admin",
  "src/components/calendar",
  "src/components/dashboard",
  "src/components/deliverability",
  "src/components/outreach",
  "src/components/realtime",
  "src/components/sequences",
  "src/components/settings",
  "src/pages/admin",
];

const DASHBOARD_PAGES = [
  "Accounts", "Admin", "Agent", "AgentChat", "Analytics", "Calendar", "Coach", "Connect",
  "Dashboard", "DashboardIntegrations", "Deliverability", "ICP", "Inbox", "Leads",
  "LiveCoaching", "MessageBlocks", "Outreach", "Pipeline", "Playbooks", "SavedLeads",
  "SequenceDetail", "Sequences", "Settings", "WhatsNew",
].map((n) => `src/pages/${n}.tsx`);

const files = [
  ...DASHBOARD_DIRS.flatMap((dir) =>
    readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => `${dir}/${f}`),
  ),
  ...DASHBOARD_PAGES,
];

describe("the dashboard draws on one surface", () => {
  it("covers every screen behind the login", () => {
    // A guard on the guard: if this list silently emptied, everything below
    // would pass while checking nothing.
    expect(files.length).toBeGreaterThan(150);
  });

  it("nothing inside it imports the card component", () => {
    const offenders = files.filter((f) => /@\/components\/ui\/card/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("nothing inside it renders a card", () => {
    const offenders = files.filter((f) => /<Card(Content|Header|Title|Description|Footer)?\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no panel title reintroduces a second heading size", () => {
    // PanelTitle is 13px. A size class on top of it is the old scale coming
    // back one file at a time, which is how the page got here.
    const offenders: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(/<PanelTitle className="([^"]*)"/g)) {
        if (/\b(text-sm|text-base|text-lg|text-xl)\b/.test(m[1])) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
