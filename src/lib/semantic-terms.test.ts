import { describe, expect, it } from "vitest";
import {
  normalizeIndustry,
  semanticTermsIn,
} from "../../supabase/functions/_shared/icp-vocab.ts";
import { normalizeIcp } from "../../supabase/functions/_shared/icp-parse.ts";

describe("semanticTermsIn", () => {
  it("recognises the ways people write an AI segment", () => {
    for (const text of [
      "AI SaaS",
      "ai saas",
      "generative AI companies",
      "machine learning startups",
      "LLM infrastructure",
      "AI-powered CRM",
    ]) {
      expect(semanticTermsIn(text), text).not.toEqual([]);
    }
  });

  it("does not read 'ai' inside an ordinary word as an AI query", () => {
    // A \b-based match treats every one of these as artificial intelligence.
    for (const text of [
      "email marketing",
      "retail founders",
      "supply chain",
      "chairman",
      "repair shops",
      "Dubai",
    ]) {
      expect(semanticTermsIn(text), text).toEqual([]);
    }
  });

  it("prefers the longest term so the query is not weakened", () => {
    expect(semanticTermsIn("AI SaaS")).toEqual(["ai saas"]);
  });
});

describe("normalizeIndustry", () => {
  it("still maps the terms it always did", () => {
    expect(normalizeIndustry("fintech")).toBe("financial services");
    expect(normalizeIndustry("AI")).toBe("computer software");
    expect(normalizeIndustry("healthcare")).toBe("hospital & health care");
  });

  it("does not let a substring decide the industry", () => {
    // "retail" contains "ai"; "email marketing" contains both "ai" and "ml".
    // Under substring matching these resolved to computer software.
    expect(normalizeIndustry("retail")).toBe("retail");
    expect(normalizeIndustry("email marketing")).toBe("marketing and advertising");
  });

  it("passes an unrecognised industry through untouched", () => {
    expect(normalizeIndustry("underwater basket weaving"))
      .toBe("underwater basket weaving");
  });
});

describe("normalizeIcp", () => {
  it("keeps the AI term as a keyword as well as an industry", () => {
    // computer software is every software company on earth; on its own it is a
    // far broader search than the one that was asked for.
    const icp = normalizeIcp({ industries: ["AI SaaS"] });

    expect(icp.industries).toEqual(["computer software"]);
    expect(icp.keywords).toContain("AI SaaS");
  });

  it("leaves an ordinary industry as a filter alone", () => {
    const icp = normalizeIcp({ industries: ["fintech"] });

    expect(icp.industries).toEqual(["financial services"]);
    expect(icp.keywords).toEqual([]);
  });

  it("still demotes an industry no taxonomy contains", () => {
    const icp = normalizeIcp({ industries: ["B2B"] });

    expect(icp.industries).toEqual([]);
    expect(icp.keywords).toContain("B2B");
  });

  it("does not repeat a term already given as a keyword", () => {
    const icp = normalizeIcp({ industries: ["AI SaaS"], keywords: ["ai saas"] });

    expect(icp.keywords.length).toBe(1);
  });
});
