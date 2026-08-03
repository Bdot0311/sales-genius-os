import { describe, expect, it } from "vitest";
import {
  extractJsonObject,
  isEmptyIcp,
  normalizeIcp,
  toSizeBucket,
  toStringArray,
} from "../../supabase/functions/_shared/icp-parse.ts";

describe("toStringArray", () => {
  // The model is asked for string arrays but does not always return them, and
  // discarding a correctly-read filter over a formatting quirk loses the user's
  // intent silently.
  it("accepts a bare string as a single-value array", () => {
    expect(toStringArray("CEO")).toEqual(["CEO"]);
  });

  it("flattens nested arrays and drops non-strings", () => {
    expect(toStringArray([["CEO"], "Founder", null, undefined, {}, 42])).toEqual([
      "CEO",
      "Founder",
      "42",
    ]);
  });

  it("drops placeholder values models emit instead of omitting a field", () => {
    expect(toStringArray(["none", "N/A", "any", "not specified", "CEO"])).toEqual(["CEO"]);
  });

  it("trims, dedupes case-insensitively, and preserves first-seen casing", () => {
    expect(toStringArray(["  CEO ", "ceo", "Founder"])).toEqual(["CEO", "Founder"]);
  });

  it("caps the number of values so one ICP cannot fan out unboundedly", () => {
    const many = Array.from({ length: 30 }, (_, i) => `Title ${i}`);
    expect(toStringArray(many)).toHaveLength(8);
  });

  it("returns an empty array for absent or unusable input", () => {
    expect(toStringArray(undefined)).toEqual([]);
    expect(toStringArray(null)).toEqual([]);
    expect(toStringArray([])).toEqual([]);
  });
});

describe("toSizeBucket", () => {
  // The backend reads "N-M" as a headcount range and "N+" as a lower bound.
  // Anything else is dropped there without a word, so it must be resolved here.
  it("keeps ranges the backend can already read", () => {
    expect(toSizeBucket("1-10")).toBe("1-10");
    expect(toSizeBucket("201-500")).toBe("201-500");
    expect(toSizeBucket("1000+")).toBe("1000+");
  });

  it("resolves word buckets through the shared vocabulary", () => {
    expect(toSizeBucket("micro")).toBe("1-10");
    expect(toSizeBucket("small")).toBe("11-50");
    expect(toSizeBucket("enterprise")).toBe("5001-10000");
  });

  it("preserves an exact range the backend can honour", () => {
    // The backend turns "2-10" into headcount >= 2 and <= 10, so passing it
    // through matches the query more closely than rounding to "1-10" would.
    expect(toSizeBucket("2-10")).toBe("2-10");
    expect(toSizeBucket("20-100")).toBe("20-100");
    expect(toSizeBucket(" 300 - 400 ")).toBe("300-400");
  });

  it("snaps a range it cannot read onto the bucket holding its floor", () => {
    expect(toSizeBucket("around 20 to 100 staff")).toBe("11-50");
    expect(toSizeBucket("roughly 300 people")).toBe("201-500");
  });

  it("treats an upper-bound phrase as starting from one", () => {
    expect(toSizeBucket("under 50 people")).toBe("1-10");
  });

  it("returns null when there is no size to read", () => {
    expect(toSizeBucket("a few")).toBeNull();
    expect(toSizeBucket("")).toBeNull();
  });
});

describe("normalizeIcp", () => {
  it("normalises every field to the pipeline's vocabulary", () => {
    const icp = normalizeIcp({
      jobTitles: ["VP of Sales"],
      seniorities: ["C-Suite"],
      industries: ["SaaS"],
      companySizes: ["2-10"],
      locations: ["United States"],
    });

    expect(icp.jobTitles).toEqual(["VP of Sales"]);
    expect(icp.seniorities).toEqual(["cxo"]);
    expect(icp.industries).toEqual(["computer software"]);
    expect(icp.companySizes).toEqual(["2-10"]);
    expect(icp.locations).toEqual(["US"]);
  });

  it("demotes a bare B2B industry to a keyword", () => {
    // "B2B" is in no industry taxonomy. Sent as an industry filter it matches
    // nothing and zeroes the result set; as a keyword it only affects ranking.
    const icp = normalizeIcp({ jobTitles: ["CEO"], industries: ["B2B"] });

    expect(icp.industries).toEqual([]);
    expect(icp.keywords).toContain("B2B");
  });

  it("keeps a real industry listed alongside B2B", () => {
    const icp = normalizeIcp({ industries: ["B2B", "Fintech"] });

    expect(icp.industries).toEqual(["financial services"]);
    expect(icp.keywords).toContain("B2B");
  });

  it("drops a size it cannot turn into a range rather than passing it through", () => {
    const icp = normalizeIcp({ jobTitles: ["CEO"], companySizes: ["a handful"] });

    expect(icp.companySizes).toEqual([]);
  });

  it("dedupes sizes that resolve to the same range", () => {
    const icp = normalizeIcp({ companySizes: ["1-10", "micro", "1-10"] });

    expect(icp.companySizes).toEqual(["1-10"]);
  });

  it("carries explicit exclusions through", () => {
    const icp = normalizeIcp({
      jobTitles: ["Founder"],
      excludeTitles: ["Co-Founder"],
      excludeIndustries: ["Staffing"],
      excludeKeywords: ["agency"],
    });

    expect(icp.excludeTitles).toEqual(["Co-Founder"]);
    expect(icp.excludeIndustries).toEqual(["Staffing"]);
    expect(icp.excludeKeywords).toEqual(["agency"]);
  });

  it("invents nothing when the query named nothing", () => {
    // A filter the user did not ask for silently changes the result set they
    // are judging, which is how a search stops matching its own description.
    const icp = normalizeIcp({});

    expect(icp).toEqual({
      jobTitles: [],
      seniorities: [],
      industries: [],
      companySizes: [],
      locations: [],
      keywords: [],
      excludeTitles: [],
      excludeIndustries: [],
      excludeKeywords: [],
    });
    expect(isEmptyIcp(icp)).toBe(true);
  });

  it("is not empty when only keywords were read", () => {
    expect(isEmptyIcp(normalizeIcp({ keywords: ["pre-revenue"] }))).toBe(false);
  });

  it("parses the ICP that originally returned random leads", () => {
    const icp = normalizeIcp({
      jobTitles: ["Founder"],
      seniorities: ["owner"],
      industries: ["SaaS"],
      companySizes: ["1-10"],
      keywords: ["pre-revenue"],
    });

    expect(icp.jobTitles).toEqual(["Founder"]);
    expect(icp.industries).toEqual(["computer software"]);
    expect(icp.companySizes).toEqual(["1-10"]);
    expect(icp.keywords).toEqual(["pre-revenue"]);
    expect(isEmptyIcp(icp)).toBe(false);
  });
});

describe("extractJsonObject", () => {
  it("reads a plain JSON object", () => {
    expect(extractJsonObject('{"jobTitles":["CEO"]}')).toEqual({ jobTitles: ["CEO"] });
  });

  it("reads an object inside a fenced block", () => {
    expect(extractJsonObject('```json\n{"jobTitles":["CEO"]}\n```')).toEqual({
      jobTitles: ["CEO"],
    });
  });

  it("reads an object with prose around it", () => {
    expect(extractJsonObject('Here you go:\n{"jobTitles":["CEO"]}\nHope that helps')).toEqual({
      jobTitles: ["CEO"],
    });
  });

  it("returns null rather than a bare array or unparseable text", () => {
    expect(extractJsonObject('["CEO"]')).toBeNull();
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });
});
