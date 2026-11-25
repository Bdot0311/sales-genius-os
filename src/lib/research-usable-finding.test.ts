import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  RESEARCH_BLOCK_THRESHOLD,
  scoreResearchQuality,
  type LeadResearchBrief,
} from "../../supabase/functions/_shared/lead-research.ts";

/** Comments stripped, so an assertion cannot match its own explanation. */
const code = (path: string) =>
  readFileSync(path, "utf8").split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");

/**
 * The card read: "Lead research · 1 finding · 33/100 insufficient · Medium
 * Confidence", and the email under it read:
 *
 *   Hi Pedro,
 *   You're on file at griddll, as Co-Founder, in Software Development.
 *
 * Research had read four pages of their site and come back with one sourced,
 * quotable finding. The gate threw it away for being two points short.
 */
const griddll = (): LeadResearchBrief => ({
  observations: [{ fact: "griddll turns Figma files into production React.", source: "https://griddll.com/product" }],
  hooks: [],
  confidence: "medium",
} as unknown as LeadResearchBrief);

const FOUR_PAGES = ["https://griddll.com/", "https://griddll.com/product", "https://griddll.com/about", "https://griddll.com/blog"];

describe("one sourced finding is enough to write from", () => {
  it("reproduces the score the owner was shown", () => {
    const quality = scoreResearchQuality(griddll(), FOUR_PAGES);
    expect(quality.score).toBe(33);
    expect(quality.label).toBe("insufficient");
    expect(quality.score).toBeLessThan(RESEARCH_BLOCK_THRESHOLD);
  });

  it("still lets that lead be personalized", () => {
    /*
     * Everything downstream -- releasableFirstTouch, voiceSafeObservation,
     * the evidence contract -- writes from exactly one approved sentence. A
     * profile-completeness score is the wrong question to ask of it.
     */
    expect(scoreResearchQuality(griddll(), FOUR_PAGES).safe_to_personalize).toBe(true);
  });

  it("reports the low score honestly all the same", () => {
    // The owner is not told the research is good. It is told it is thin.
    const quality = scoreResearchQuality(griddll(), FOUR_PAGES);
    expect(quality.score).toBe(33);
    expect(quality.gaps).toContain("Fewer than 3 concrete findings from their site");
    expect(quality.gaps).toContain("No personalization angle found");
  });

  it("does not let an unsourced claim through", () => {
    /*
     * A floating claim is exactly what the evidence gates cannot check, so a
     * finding with no page behind it buys nothing.
     */
    const floating = { observations: [{ fact: "griddll is growing fast." }], hooks: [], confidence: "medium" };
    const quality = scoreResearchQuality(floating as unknown as LeadResearchBrief, FOUR_PAGES);
    expect(quality.safe_to_personalize).toBe(false);
  });

  it("refuses a lead with no research at all", () => {
    expect(scoreResearchQuality(null).safe_to_personalize).toBe(false);
    expect(scoreResearchQuality({ observations: [], hooks: [] } as unknown as LeadResearchBrief, []).safe_to_personalize).toBe(false);
  });
});

describe("thin research reaches the writer instead of the template", () => {
  const GENERATE = code("supabase/functions/generate-email/index.ts");

  it("sends the no-research template only when nothing can be grounded", () => {
    /*
     * The early return used to fire on the LABEL -- "thin" or worse, i.e.
     * anything under 60/100 -- which is a different and much higher bar than
     * the gate the rest of the file uses. Every lead between 35 and 59 got
     * the generic email although its research was good enough to quote.
     */
    expect(GENERATE).toContain("!researchQuality.safe_to_personalize && !blockOnThinResearch");
    expect(GENERATE).not.toContain('const researchIsThin = researchQuality.label === "thin"');
  });

  it("keeps the template reachable as the last resort inside the pipeline", () => {
    // Moving the gate must not turn a bad draft into a hard failure.
    expect(GENERATE).toContain("releaseThinLead()");
    expect(GENERATE).toContain("await releaseSafeObservation() || releaseThinLead()");
  });
});

describe("the prompt tells a thin lead's writer what it may use", () => {
  const RESEARCH = code("supabase/functions/_shared/lead-research.ts");

  it("cautions rather than forbids when there is a sourced fact", () => {
    /*
     * The CAUTION branch was keyed on the "thin" label alone, so a lead that
     * now gets through on one sourced finding -- label "insufficient" --
     * would have reached the writer with no instruction at all.
     */
    expect(RESEARCH).toContain('quality.label === "thin" || quality.label === "insufficient"');
    expect(RESEARCH).toContain("Reference ONLY the observations listed above verbatim");
  });

  it("still forbids company-specific claims when nothing is grounded", () => {
    expect(RESEARCH).toContain("if (!quality.safe_to_personalize)");
    expect(RESEARCH).toContain("do NOT imply you studied their website");
  });
});
