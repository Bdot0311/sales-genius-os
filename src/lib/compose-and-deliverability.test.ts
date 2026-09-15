import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const OUTREACH = readFileSync("src/pages/Outreach.tsx", "utf8");
const CONNECTION = readFileSync("src/components/deliverability/ConnectionHealthGrid.tsx", "utf8");
const ACCOUNTS = readFileSync("src/components/deliverability/AccountHealthGrid.tsx", "utf8");
const PANEL = readFileSync("src/components/dashboard/Panel.tsx", "utf8");
const ICP = readFileSync("src/pages/ICP.tsx", "utf8");

describe("the outreach compose column", () => {
  it("has one kind of chip, not three", () => {
    // A tinted primary pill for a fact, a "secondary" one for a tool and a
    // green one for the score, all inside the same box.
    expect(OUTREACH).not.toContain("rounded-full text-xs bg-primary/10 text-primary font-medium");
    expect(OUTREACH).not.toContain("rounded-full text-xs bg-secondary/60");
    expect(OUTREACH).toContain("<Chip");
  });

  it("uses words where it used emoji", () => {
    expect(OUTREACH).not.toContain("📝");
    expect(OUTREACH).not.toContain("⚠️ Limited lead data");
    expect(OUTREACH).toContain("Your note");
  });

  it("the envelope lines up", () => {
    // "To:" and "Subject:" each started wherever their own label ended.
    expect(OUTREACH).toContain('<dt className="w-14 shrink-0 text-muted-foreground/60">To</dt>');
  });

  it("its form labels match the panel titles above them", () => {
    // shadcn's Label is 14px and every panel title on this page is 13, so the
    // fields ran a step louder than the headings containing them.
    expect(OUTREACH).not.toMatch(/<Label>/);
  });

  it("is written in sentence case like the rest of the dashboard", () => {
    for (const s of ["Email Tone", "Subject Line", "Email Body", "Select Lead", "Send From"]) {
      expect(OUTREACH, s).not.toContain(`>${s}<`);
    }
  });
});

describe("deliverability", () => {
  it("mailboxes are rows, not a grid of small cards", () => {
    // An address, a state and one sentence is a row's worth of content; it had
    // a border, a shadow and its own padding, two across.
    expect(CONNECTION).not.toContain('<div className="grid gap-3 sm:grid-cols-2">');
    expect(CONNECTION).toContain("<PanelHeader");
    expect(CONNECTION).toContain("<PanelFooter");
  });

  it("still says uptime is not placement", () => {
    // A column of green ticks here is the exact thing people misread.
    expect(CONNECTION).toContain("This is uptime, not placement");
  });

  it("no number is three times the size of the text explaining it", () => {
    expect(ACCOUNTS).not.toContain("text-3xl font-bold tabular-nums");
    expect(ACCOUNTS).toContain("text-xl font-semibold tabular-nums");
  });

  it("explanatory prose sits below the panel titles, not above them", () => {
    const files = readdirSync("src/components/deliverability").filter((f) => f.endsWith(".tsx"));
    const offenders = files.filter((f) =>
      readFileSync(`src/components/deliverability/${f}`, "utf8").includes('className="text-sm text-muted-foreground"'),
    );
    expect(offenders).toEqual([]);
  });

  it("uses the shared empty state rather than centred text in a panel", () => {
    expect(CONNECTION).toContain("<EmptyState");
    expect(ACCOUNTS).toContain("<EmptyState");
  });
});

describe("the chip", () => {
  it("lives in one place", () => {
    // Built for the ICP editor first; Outreach would have been the second copy.
    expect(PANEL).toContain("export const Chip = (");
    expect(ICP).toContain('Chip, EmptyState, Panel');
    expect(ICP).not.toContain("const Chip = (");
  });

  it("marks selection with a border rather than a fill", () => {
    // A dozen filled marks turns a record of what you picked into the loudest
    // thing on the page.
    expect(PANEL).toContain('"border-primary/50 bg-primary/10 text-foreground"');
  });

  it("is a button only when it does something", () => {
    expect(PANEL).toContain("return onClick ? (");
  });
});
