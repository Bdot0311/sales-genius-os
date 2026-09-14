import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * One page title, one size.
 *
 * Ten dashboard pages rendered their own `<h1 className="text-2xl sm:text-3xl
 * font-bold">` while the rest used PageHeader, which sets 18px semibold. A 30px
 * title on Inbox and an 18px title on Leads is the single most visible reason
 * the dashboard read as several products stitched together — it is the first
 * thing on the page and it changed size as you navigated.
 *
 * Four of them also carried an icon-only back arrow beside the title, which
 * says there is a way back without saying where to. PageHeader's breadcrumbs
 * say both.
 *
 * These pages delegate their header to a child component, so PageHeader does
 * not appear in the page file itself.
 */
const DELEGATES_HEADER = new Set([
  "AgentChat.tsx",
  "MessageBlocks.tsx",
  "SequenceDetail.tsx",
  "Sequences.tsx",
]);

const pageFiles = readdirSync("src/pages", { recursive: true, encoding: "utf8" })
  .filter((f): f is string => typeof f === "string" && f.endsWith(".tsx"))
  .map((f) => ({ name: f, path: join("src/pages", f), src: readFileSync(join("src/pages", f), "utf8") }))
  .filter((f) => f.src.includes("DashboardLayout>"));

describe("every dashboard page uses the shared header", () => {
  it("found the dashboard pages to check", () => {
    // A guard on the guard: a rename that broke the glob would otherwise make
    // this suite pass by checking nothing.
    expect(pageFiles.length).toBeGreaterThan(10);
  });

  for (const page of pageFiles) {
    const base = page.name.split("/").pop()!;
    if (DELEGATES_HEADER.has(base)) continue;
    it(`${page.name}`, () => {
      expect(page.src, `${page.path} should render <PageHeader>`).toContain("<PageHeader");
    });
  }
});

describe("no page sets its own title size", () => {
  for (const page of pageFiles) {
    it(`${page.name}`, () => {
      // Display sizes on a page title. The shared header owns this decision.
      expect(page.src, page.path).not.toMatch(/<h1[^>]*className="[^"]*text-(?:2xl|3xl|4xl)/);
    });
  }
});
