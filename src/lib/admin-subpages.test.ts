import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";

const adminFiles = ["src/pages/admin", "src/components/admin"].flatMap((dir) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `${dir}/${f}`),
);
const read = (f: string) => readFileSync(f, "utf8");
const GROUP = read("src/components/admin/AdminTabGroup.tsx");
const PANEL = read("src/components/dashboard/Panel.tsx");

/**
 * The pages inside the admin panel, not just the dashboard in front of them.
 *
 * The first pass moved every admin screen onto the shared surface, which is a
 * rename. These are the shapes underneath it.
 */
describe("the admin sub-pages", () => {
  it("no page opens with a 24px bold heading behind a coloured icon", () => {
    // Each sub-page did, inside a tab whose trigger already named it.
    const offenders = adminFiles.filter((f) => /text-2xl font-bold/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no panel title has an icon illustrating the word beside it", () => {
    const offenders: string[] = [];
    for (const f of adminFiles) {
      for (const m of read(f).matchAll(/<PanelTitle[^>]*>\s*\n\s*<(\w+) className="h-[45] w-[45]/g)) {
        offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("counts are strips, not grids of tiles with coloured discs", () => {
    for (const f of [
      "src/pages/admin/Analytics.tsx",
      "src/pages/admin/Security.tsx",
      "src/pages/admin/Billing.tsx",
      "src/pages/admin/Alerts.tsx",
      "src/pages/admin/Activation.tsx",
      "src/pages/admin/SignupLogs.tsx",
    ]) {
      expect(read(f), f).toContain("<MetricStrip");
    }
    const offenders = adminFiles.filter((f) => /p-3 rounded-full bg-\w+-500\/10/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("drops the per-tile component nothing renders any more", () => {
    expect(read("src/pages/admin/Alerts.tsx")).not.toContain("function StatCard(");
  });

  it("the group tab strip scrolls rather than wrapping", () => {
    // Wrapping put a second row of navigation above the content on any narrow
    // window, in a shell that already had too much of it.
    expect(GROUP).not.toContain("flex h-auto w-full flex-wrap justify-start");
    expect(GROUP).toContain("overflow-x-auto");
  });

  it("imports no icon it does not draw", () => {
    const offenders: string[] = [];
    for (const f of adminFiles) {
      const src = read(f);
      const m = /import \{([^}]*)\} from "lucide-react";/s.exec(src);
      if (!m) continue;
      for (const name of m[1].split(",").map((n) => n.trim()).filter(Boolean)) {
        if ((src.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length === 1) offenders.push(`${f}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("a metric strip used as a filter row", () => {
  it("marks the applied reading on its edge, not by tinting the cell", () => {
    // Activation marked its filtered cohort by turning that tile's whole border
    // primary, which reads as an error before it reads as a selection.
    expect(PANEL).toContain("selected?: boolean;");
    expect(PANEL).toContain('aria-pressed={m.selected}');
    expect(PANEL).toContain('<span className="absolute inset-x-0 top-0 h-0.5 bg-primary"');
    expect(read("src/pages/admin/Activation.tsx")).not.toContain('cohort === k ? "border-primary" : ""');
  });
});
