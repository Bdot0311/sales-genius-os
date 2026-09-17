import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeFilters } from "./lead-filters";

const PAGE = readFileSync("src/pages/Leads.tsx", "utf8");
const WAITING = readFileSync("src/components/dashboard/SearchingResults.tsx", "utf8");
const TAILWIND = readFileSync("tailwind.config.ts", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * The wait between asking for leads and getting them.
 *
 * Five identical grey rows, pulsing in unison against a near-black page: on a
 * phone it filled the screen and said nothing, and a slow search looked exactly
 * like a stuck one.
 */
describe("the wait says what the search is doing", () => {
  it("reads the criteria back, because they are known before the request leaves", () => {
    const rows = describeFilters({
      job_title: "Founder",
      job_titles: ["Founder", "Co-founder"],
      industry: "Financial services",
      country: "United States",
      company_size: "11-50",
    });
    expect(rows).toEqual([
      { label: "Role", values: ["Founder", "Co-founder"] },
      { label: "Industry", values: ["Financial services"] },
      { label: "Location", values: ["United States"] },
      { label: "Company size", values: ["11-50"] },
    ]);
  });

  it("does not list the first value twice when both fields carry it", () => {
    // The plural field carries every value and the singular carries the first.
    const rows = describeFilters({ industry: "Software", industries: ["Software", "Fintech"] });
    expect(rows).toEqual([{ label: "Industry", values: ["Software", "Fintech"] }]);
  });

  it("gathers the three exclusion fields into one line", () => {
    const rows = describeFilters({
      exclude_titles: ["Co-founder"],
      exclude_industries: ["Staffing"],
      exclude_keywords: ["recruiting"],
    });
    expect(rows).toEqual([
      { label: "Excluding", values: ["Co-founder", "Staffing", "recruiting"] },
    ]);
  });

  it("shows nothing rather than empty labels when a search carries no criteria", () => {
    expect(describeFilters({ limit: 25, page: 1 })).toEqual([]);
    expect(describeFilters({ job_title: "   ", countries: [] })).toEqual([]);
  });

  it("puts the waiting state in one component instead of inline rows", () => {
    expect(code(PAGE)).toContain("<SearchingResults filters={externalFilters} />");
    expect(code(PAGE)).not.toContain("Array.from({ length: 5 })");
  });

  it("counts real elapsed time and claims nothing about what is left", () => {
    expect(code(WAITING)).toContain("setSeconds((s) => s + 1)");
    expect(code(WAITING)).not.toMatch(/\bprogress\s*=|percent|\bstep\s*\d/i);
  });

  it("moves, on animations that exist, and stops when the reader asks it to", () => {
    expect(TAILWIND).toContain('"shimmer"');
    expect(TAILWIND).toContain('"sweep"');
    expect(code(WAITING)).toContain("animate-shimmer");
    expect(code(WAITING)).toContain("animate-sweep");
    expect(code(WAITING)).toContain("motion-reduce:animate-none");
    expect(code(WAITING)).toContain("motion-reduce:hidden");
  });

  it("writes every width out, because Tailwind cannot see one built at runtime", () => {
    for (const w of ["w-[38%]", "w-[64%]", "w-[52%]", "w-[43%]", "w-[31%]", "w-[71%]"]) {
      expect(WAITING).toContain(w);
    }
  });

  it("never sets a delay on an element that runs no animation", () => {
    // A delay on a static row is dead CSS that reads as intent.
    const delays = code(WAITING).match(/animationDelay/g) ?? [];
    const shimmering = code(WAITING).match(/SHIMMER/g) ?? [];
    expect(delays.length).toBeLessThanOrEqual(shimmering.length);
  });
});
