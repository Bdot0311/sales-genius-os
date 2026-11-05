import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  RESEARCH_TTL_DAYS,
  isResearchFresh,
  researchInputs,
} from "../../supabase/functions/_shared/lead-research";

/**
 * Research invalidated itself, and the symptom was the same work twice.
 *
 * isResearchFresh went stale when updated_at ran past researched_at, the idea
 * being that a changed lead needs new context. public.leads has a BEFORE
 * UPDATE trigger that sets updated_at on EVERY write, and scoring, enrichment,
 * stage changes and the send path all write to the row.
 *
 * So "research these 49 leads, qualify them, then draft" invalidated its own
 * research: research wrote the brief, scoring wrote a tier a moment later, and
 * generate-email found all 49 stale and scraped all 49 sites again. A 14-day
 * cache that could not survive the next step of its own pipeline.
 */

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;

const lead = (over: Record<string, unknown> = {}) => {
  const base = {
    company_website: "kogenie.com",
    contact_email: "dana@kogenie.com",
    company_name: "Kogenie",
    linkedin_url: "",
    company_linkedin: "",
  };
  const row = { ...base, ...over };
  return {
    research_brief: { what_they_do: "x" },
    researched_at: ago(10 * MIN),
    research_inputs: researchInputs(base),
    ...row,
  };
};

describe("a brief survives a write that changed nothing it was built from", () => {
  it("is still fresh after the row is scored", () => {
    // The exact sequence from the report: research, then a tier written a
    // moment later, then drafting.
    expect(isResearchFresh({ ...lead(), updated_at: new Date().toISOString() })).toBe(true);
  });

  it("is stale when the website changes", () => {
    expect(isResearchFresh(lead({ company_website: "kogenie.io" }))).toBe(false);
  });

  it("is stale when the company name changes", () => {
    expect(isResearchFresh(lead({ company_name: "KOgenie Labs" }))).toBe(false);
  });

  it("is stale when enrichment finds a different email domain", () => {
    expect(isResearchFresh(lead({ contact_email: "dana@kogenielabs.com" }))).toBe(false);
  });

  it("ignores a change to anything research never read", () => {
    expect(isResearchFresh({ ...lead(), tier: "A", pipeline_stage: "contacted" } as never)).toBe(true);
  });

  it("still expires on the TTL", () => {
    const old = { ...lead(), researched_at: ago((RESEARCH_TTL_DAYS + 1) * 86_400_000) };
    expect(isResearchFresh(old)).toBe(false);
  });

  it("has nothing to reuse without a brief", () => {
    expect(isResearchFresh({ ...lead(), research_brief: null })).toBe(false);
    expect(isResearchFresh({ ...lead(), researched_at: null })).toBe(false);
  });
});

describe("rows researched before this shipped", () => {
  const legacy = () => {
    const l = lead();
    delete (l as Record<string, unknown>).research_inputs;
    return l;
  };

  /*
   * Falling back to updated_at would keep the bug alive until every brief
   * aged out of a fourteen-day TTL.
   */
  it("are not re-invalidated by an unrelated write", () => {
    expect(isResearchFresh({ ...legacy(), updated_at: new Date().toISOString() })).toBe(true);
    expect(isResearchFresh({ ...legacy(), research_inputs: null, updated_at: new Date().toISOString() })).toBe(true);
  });

  it("still go stale when enrichment runs, which does change the inputs", () => {
    expect(isResearchFresh({ ...legacy(), enriched_at: new Date().toISOString() })).toBe(false);
  });
});

describe("the fingerprint", () => {
  it("is the same for the same inputs", () => {
    expect(researchInputs({ company_website: "Kogenie.com ", company_name: "KOGENIE" }))
      .toBe(researchInputs({ company_website: "kogenie.com", company_name: "kogenie" }));
  });

  it("falls back to the website field when company_website is empty", () => {
    expect(researchInputs({ website: "kogenie.com" })).toContain("kogenie.com");
  });

  it("uses the email domain, not the whole address", () => {
    const a = researchInputs({ contact_email: "dana@kogenie.com" });
    const b = researchInputs({ contact_email: "sam@kogenie.com" });
    expect(a).toBe(b);
  });
});

describe("every reader fetches what the comparison needs", () => {
  /*
   * A select that omits these computes an empty fingerprint, which matches
   * nothing — the same bug, louder.
   */
  const NEEDED = ["research_inputs", "company_website", "contact_email", "company_name"];
  for (const [name, path] of [
    ["research-lead", "supabase/functions/research-lead/index.ts"],
    ["generate-email", "supabase/functions/generate-email/index.ts"],
    /*
     * The agent's reader moved out of agent-run and into _shared so it could
     * be tested without starting a server. The invariant did not move: the
     * select that feeds the freshness check still has to carry every field the
     * comparison reads, wherever it lives.
     */
    ["agent-run", "supabase/functions/_shared/lead-research-block.ts"],
  ] as const) {
    it(`${name} selects the fingerprint fields`, () => {
      // The select that also fetches research_brief is the one feeding the
      // freshness check; it has to carry everything the comparison reads.
      const src = readFileSync(path, "utf8");
      // The column list is one line in each of the three, whether it sits
      // inline in .select() or in a const above it.
      const selects = src
        .split("\n")
        .filter((line) => line.includes("research_brief") && line.includes("researched_at"));
      expect(selects.length, `${name} has no research select`).toBeGreaterThan(0);
      for (const sel of selects) {
        for (const field of NEEDED) {
          expect(sel, `${name} is missing ${field}`).toContain(field);
        }
      }
    });
  }

  it("research-lead records the fingerprint when it writes a brief", () => {
    const src = readFileSync("supabase/functions/research-lead/index.ts", "utf8");
    expect(src).toContain("research_inputs: researchInputs(");
    const write = src.indexOf("researched_at: researchedAt,");
    expect(src.indexOf("research_inputs: researchInputs(")).toBeGreaterThan(write - 400);
  });

  it("the column exists", () => {
    const sql = readFileSync("supabase/migrations/20261014120000_research_inputs.sql", "utf8");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS research_inputs text");
  });
});
