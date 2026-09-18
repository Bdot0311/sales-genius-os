import { describe, expect, it } from "vitest";
import {
  buildExternalFilters,
  describeFilters,
  normalizeCompanySizeBucket,
  parseRequestedCount,
} from "./lead-filters";
import { readFileSync } from "node:fs";

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

  it("preserves the original description for semantic provider search", () => {
    const query = "Founders and CTOs at AI companion startups in the US under 50 employees";
    const filters = buildExternalFilters(
      { jobTitles: ["Founder", "CTO"], keywords: ["AI companion", "seed", "Series A"] },
      10,
      query,
    );

    expect(filters.query).toBe(query);
  });
});

describe("repeat suppression", () => {
  it("always excludes leads the user already has", () => {
    // Without this every search re-showed the last search's people: the
    // provider returns its first page for a given filter set, and that page
    // does not change because you saved some of it.
    expect(buildExternalFilters({ jobTitles: ["VP Sales"] }, 25).exclude_seen).toBe(true);
  });

  it("keeps the original sentence so two different searches differ", () => {
    // The backend hashes the resolved params to key its cache. Two different
    // sentences that parse to the same coarse filters were the same request.
    const a = buildExternalFilters({ jobTitles: ["VP Sales"] }, 25, "VP Sales at AI SaaS");
    const b = buildExternalFilters({ jobTitles: ["VP Sales"] }, 25, "VP Sales at fintechs");

    expect(a.query).toBe("VP Sales at AI SaaS");
    expect(a.query).not.toBe(b.query);
  });
});

describe("broadening is opt-in", () => {
  it("does not ask to broaden by default", () => {
    // The ladder that drops industry and seniority runs only when the user
    // presses "broaden". Running it automatically answered a different, wider
    // question than the one asked, and every search eventually collapsed to
    // the same broad one — which is why the same people kept coming back.
    expect(buildExternalFilters({ jobTitles: ["Founder"] }, 25).relax).toBeUndefined();
  });

  it("keeps agent searches strict when the ICP says so", () => {
    // An agent states its ICP exactly; widening it is never a favour.
    const icp = { jobTitles: ["Founder"], industries: ["computer software"] };

    expect(buildExternalFilters(icp, 25).relax).toBeUndefined();
  });
});

/**
 * How many a search returns used to come from a "Show: 10" dropdown beside the
 * pager, and the sentence lost to it: parse-lead-query reads a limit out of
 * "find me 25 founders", buildExternalFilters overwrote it, and ten came back.
 * Asking for a number and being given a different one is the kind of small lie
 * that costs trust in everything else on the page.
 */
describe("the count comes from the sentence", () => {
  it("reads a number someone actually asked for", () => {
    expect(parseRequestedCount("find me 25 founders in fintech")).toBe(25);
    expect(parseRequestedCount("give me 50 leads")).toBe(50);
    expect(parseRequestedCount("Top 30 CEOs at US SaaS companies")).toBe(30);
    expect(parseRequestedCount("I want 12 prospects")).toBe(12);
    expect(parseRequestedCount("show me 5 of them")).toBe(5);
    expect(parseRequestedCount("Find 15 CTOs")).toBe(15);
  });

  it("leaves the numbers that are not a count alone", () => {
    // A lead query is full of these, and reading the wrong one spends the
    // user's credits on the wrong search. This is the real query from the
    // screenshot that started this.
    expect(
      parseRequestedCount(
        "Find Founders and CEOs at US-based B2B SaaS companies with 1-10 employees, " +
          "founded 2019-2024, excluding SDR, BDR, AE, agencies, stealth, over 15 employees",
      ),
    ).toBeNull();
    for (const q of [
      "SaaS companies with 50 employees",
      "companies founded 2019-2024",
      "firms with under 20 people",
      "startups between 11-50 people",
      "companies over 15 employees",
      "CEOs at companies up to 200 people",
      "founders in the UK",
      "",
    ]) {
      expect(parseRequestedCount(q), q).toBeNull();
    }
  });

  it("asks the provider for no more than a page can hold", () => {
    expect(parseRequestedCount("give me 500 leads")).toBe(100);
    expect(parseRequestedCount("0 leads")).toBeNull();
  });

  it("lets the sentence win over the parser and the default", () => {
    expect(buildExternalFilters({}, 10, "find me 25 founders").limit).toBe(25);
    expect(buildExternalFilters({ limit: 40 }, 10, "give me 15 leads").limit).toBe(15);
    // Nothing in the sentence: the parser's reading, then the default.
    expect(buildExternalFilters({ limit: 40 }, 10, "founders in the UK").limit).toBe(40);
    expect(buildExternalFilters({}, 25, "founders in the UK").limit).toBe(25);
  });

  it("reads the number back while the search is still running", () => {
    expect(describeFilters({ limit: 25 })[0]).toEqual({ label: "How many", values: ["25"] });
  });

  it("has no dropdown left to disagree with the sentence", () => {
    const page = readFileSync("src/pages/Leads.tsx", "utf8");
    expect(page).not.toContain("Show:");
    expect(page).not.toContain("<SelectItem");
    // The pager still has to ask for the same number on page 2.
    expect(page).toContain("setPageSize(newFilters.limit ?? pageSize)");
  });
});
