import { describe, expect, it } from "vitest";
import { buildExternalFilters, normalizeCompanySizeBucket } from "./lead-filters";

describe("normalizeCompanySizeBucket", () => {
  // The parser is an LLM and returns whatever the user typed. Sizes outside the
  // six known buckets used to be dropped, so "2-10 people" searched every size.
  it("passes through the buckets the provider already accepts", () => {
    for (const bucket of ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]) {
      expect(normalizeCompanySizeBucket(bucket)).toBe(bucket);
    }
  });

  it("keeps an exact range the backend can honour", () => {
    // The backend turns "2-10" into headcount >= 2 and <= 10, so rounding it to
    // "1-10" would search for companies the user did not ask for.
    expect(normalizeCompanySizeBucket("2-10")).toBe("2-10");
    expect(normalizeCompanySizeBucket("20-100")).toBe("20-100");
    expect(normalizeCompanySizeBucket("5000+")).toBe("5000+");
  });

  it("snaps a range it cannot read onto the bucket holding its floor", () => {
    expect(normalizeCompanySizeBucket("around 20 to 100 staff")).toBe("11-50");
    expect(normalizeCompanySizeBucket("roughly 300 people")).toBe("201-500");
  });

  it("treats an upper-bound phrase as starting from one", () => {
    expect(normalizeCompanySizeBucket("under 50")).toBe("1-10");
    expect(normalizeCompanySizeBucket("up to 200")).toBe("1-10");
  });

  it("returns undefined when there is no size to read", () => {
    expect(normalizeCompanySizeBucket(undefined)).toBeUndefined();
    expect(normalizeCompanySizeBucket("")).toBeUndefined();
    expect(normalizeCompanySizeBucket("small")).toBeUndefined();
  });
});

describe("buildExternalFilters", () => {
  it("keeps every job title so the ICP is searched in full", () => {
    // Only jobTitles[0] used to survive, so "CEOs and Founders" searched CEOs
    // and quietly ignored founders. The plural field drives the edge function's
    // fan-out, which runs one search per title and merges them.
    const filters = buildExternalFilters(
      { jobTitles: ["CEO", "Founder", "Owner"] },
      10,
    );

    expect(filters.job_title).toBe("CEO");
    expect(filters.job_titles).toEqual(["CEO", "Founder", "Owner"]);
  });

  it("does not set the plural field for a single title", () => {
    const filters = buildExternalFilters({ jobTitles: ["CEO"] }, 10);

    expect(filters.job_title).toBe("CEO");
    expect(filters.job_titles).toBeUndefined();
  });

  it("keeps every industry and location", () => {
    const filters = buildExternalFilters(
      { industries: ["SaaS", "Fintech"], locations: ["United States", "Canada"] },
      10,
    );

    expect(filters.industry).toBe("SaaS");
    expect(filters.industries).toEqual(["SaaS", "Fintech"]);
    expect(filters.country).toBe("United States");
    expect(filters.countries).toEqual(["United States", "Canada"]);
  });

  it("keeps a company size the provider does not name directly", () => {
    const filters = buildExternalFilters({ companySizes: ["2-10"] }, 10);

    expect(filters.company_size).toBe("2-10");
  });

  it("demotes a bare B2B industry to a keyword rather than filtering on it", () => {
    const filters = buildExternalFilters({ industries: ["B2B"] }, 10);

    expect(filters.industry).toBeUndefined();
    expect(filters.keywords).toContain("B2B");
  });

  it("keeps the real industry when B2B is listed alongside it", () => {
    const filters = buildExternalFilters({ industries: ["B2B", "Fintech"] }, 10);

    expect(filters.industry).toBe("Fintech");
  });

  it("derives a job title from keywords when none was parsed", () => {
    const filters = buildExternalFilters(
      { keywords: ["Series A", "founder", "remote"] },
      10,
    );

    expect(filters.job_title).toBe("founder");
  });

  it("carries the page size through as the limit", () => {
    expect(buildExternalFilters({}, 25).limit).toBe(25);
  });
});
