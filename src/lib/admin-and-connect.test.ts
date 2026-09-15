import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const SHELL = readFileSync("src/pages/Admin.tsx", "utf8");
const SIDEBAR = readFileSync("src/components/admin/AdminSidebar.tsx", "utf8");
const DASH = readFileSync("src/components/admin/AdminDashboard.tsx", "utf8");
const GATEWAY = readFileSync("src/components/admin/AiGatewayUsageCard.tsx", "utf8");
const CONNECT = readFileSync("src/pages/Connect.tsx", "utf8");
const PANEL = readFileSync("src/components/dashboard/Panel.tsx", "utf8");

const adminFiles = ["src/pages/admin", "src/components/admin"].flatMap((dir) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `${dir}/${f}`),
);

describe("the admin shell", () => {
  it("is one ground, not two documents stacked", () => {
    // The content area was painted bg-muted/30 and the header strip
    // bg-background, and neither was the colour the rest of the product uses.
    expect(SHELL).not.toContain("bg-muted/30");
    expect(SHELL).toContain("flex min-h-screen w-full bg-background");
  });

  it("the heading is at the scale everything else uses", () => {
    expect(SHELL).not.toContain('<h1 className="text-xl font-bold">Admin Control Panel</h1>');
    expect(SHELL).toContain('<h1 className="text-[0.8125rem] font-medium text-foreground">Admin</h1>');
  });

  it("waiting for an access check is a sentence, not a page-sized spinner", () => {
    expect(SHELL).not.toContain("h-12 w-12 border-b-2 border-primary");
  });

  it("the sidebar does not explain that a list of links is navigation", () => {
    expect(SIDEBAR).not.toContain("SidebarGroupLabel");
    // Nor announce elevated permissions to somebody already inside the panel.
    expect(SIDEBAR).not.toContain("Elevated permissions enabled");
  });
});

describe("the admin dashboard", () => {
  it("has no stripe down the left edge of a card", () => {
    // A thick coloured side border is never a deliberate choice; here it was
    // six of them, all the same colour, saying nothing.
    expect(DASH).not.toContain("border-l-4");
    expect(GATEWAY).not.toContain("border-l-4");
  });

  it("does not build a class name at runtime", () => {
    // The icon discs took their background from the text colour rewritten into
    // a background one. Tailwind ships only class names written out in the
    // source, so every one of those discs rendered transparent.
    expect(DASH).not.toContain("stat.color.replace(");
  });

  it("is one strip of readings rather than six icon cards", () => {
    expect(DASH).toContain("<MetricStrip metrics={metrics} columns={3} />");
    expect(DASH).not.toContain("const statCards");
    expect(DASH).not.toContain("animationDelay");
  });
});

describe("every admin screen is on the dashboard's surface", () => {
  it("none of them import the card component", () => {
    const offenders = adminFiles.filter((f) => readFileSync(f, "utf8").includes("@/components/ui/card"));
    expect(offenders).toEqual([]);
  });

  it("no title reintroduces a second heading size", () => {
    // PanelTitle is 13px; text-base or text-lg on top of it puts the admin
    // pages back on a scale nothing else in the product uses.
    const offenders: string[] = [];
    for (const f of adminFiles) {
      for (const m of readFileSync(f, "utf8").matchAll(/<PanelTitle className="([^"]*)"/g)) {
        if (/\b(text-base|text-lg|text-sm)\b/.test(m[1])) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("connect ai", () => {
  it("is built from the dashboard's surface", () => {
    expect(CONNECT).not.toMatch(/<Card\b/);
    expect(CONNECT).toContain("<Panel");
  });

  it("holds the two clients as data rather than four hand-built cards", () => {
    // Setup and refresh were separate grids under separate headings, which is
    // how the two halves drifted apart in order and wording.
    expect(CONNECT).toContain("const CLIENTS");
    expect(CONNECT).toContain("Set it up");
    expect(CONNECT).toContain("Refresh after an update");
  });

  it("does not put a tinted disc beside every step", () => {
    // Twenty numbered circles on a page that is almost entirely instructions.
    expect(CONNECT).not.toContain("w-6 h-6 rounded-full bg-primary/15");
  });

  it("does not illustrate its own heading", () => {
    expect(CONNECT).not.toContain("<Bot ");
  });
});

describe("the shared header strip", () => {
  it("takes either a title or free-form content", () => {
    // The admin pages carry a title with a sentence under it, written as
    // children; rewriting two hundred of those to fit a two-prop signature
    // would be a worse change than letting the strip hold what it is given.
    expect(PANEL).toContain("children?: ReactNode;");
    expect(PANEL).toContain("{children ?? (");
    expect(PANEL).toContain("export const PanelTitle");
    expect(PANEL).toContain("export const PanelDescription");
  });
});
