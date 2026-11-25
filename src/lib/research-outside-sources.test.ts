import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { companyProfileQueries, leadResearchQueries } from "../../supabase/functions/_shared/parallel.ts";
import { UNQUOTABLE_SOURCE_HOSTS, unquotableSourceHost } from "../../supabase/functions/_shared/lead-research.ts";
import { externalResearchSearch } from "../../supabase/functions/_shared/external-research.ts";
import { gatherLeadResearch } from "../../supabase/functions/_shared/research-gather.ts";

/**
 * Every finding on every card read "OBSERVED ON THEIR SITE", and the one that
 * did come from outside reached a prospect like this:
 *
 *   Saw this on prospeo.io: "Departments Number of employees HR 1 See all
 *   employees Funding Data Cosmic Labs has never raised funding before."
 *
 * Grounding was never involved. That page was really fetched and the sentence
 * really is on it — it is a lead-database profile of the person being emailed,
 * read left to right across its table.
 */
describe("a lead database is never a source", () => {
  it("refuses the host that reached a prospect", () => {
    expect(unquotableSourceHost("https://prospeo.io/company/cosmic-labs")).toBe(true);
  });

  it("refuses the rest of the contact-data brokers", () => {
    for (const url of [
      "https://www.rocketreach.co/cosmic-labs",
      "https://apollo.io/companies/acme",
      "https://www.zoominfo.com/c/acme/123",
      "https://lusha.com/company-search/acme/abc",
      "https://signalhire.com/companies/acme",
      "https://hunter.io/companies/acme.com",
      "https://www.glassdoor.com/Overview/Working-at-Acme",
      "https://growjo.com/company/Acme",
    ]) {
      expect(unquotableSourceHost(url), url).toBe(true);
    }
  });

  it("refuses social and directory profiles too", () => {
    expect(unquotableSourceHost("https://www.linkedin.com/company/acme")).toBe(true);
    expect(unquotableSourceHost("https://x.com/acme/status/1")).toBe(true);
    expect(unquotableSourceHost("https://www.crunchbase.com/organization/acme")).toBe(true);
  });

  it("leaves real coverage alone", () => {
    for (const url of [
      "https://techcrunch.com/2026/01/02/acme-raises",
      "https://www.acme.com/about",
      "https://www.theverge.com/acme",
      "https://blog.acme.com/launch",
    ]) {
      expect(unquotableSourceHost(url), url).toBe(false);
    }
  });

  it("survives a malformed url instead of throwing", () => {
    expect(unquotableSourceHost("not a url")).toBe(false);
  });

  it("drops a broker result the provider returned anyway", async () => {
    /*
     * excludeDomains is a request to the provider, not a promise, so the
     * result set is filtered again on the way in.
     */
    const searchOutside = vi.fn(async () => ({
      results: [
        { url: "https://prospeo.io/company/cosmic-labs", title: "Cosmic Labs", publish_date: "", excerpts: ["Funding Data"] },
        { url: "https://techcrunch.com/cosmic-labs", title: "Cosmic Labs raises", publish_date: "2026-01-02", excerpts: ["raised"] },
      ],
      sessionId: null,
      error: null,
      providers: { parallel: { error: null, sources: 2 }, context_dev: { error: null, sources: 0 } },
    })) as unknown as typeof externalResearchSearch;

    const gathered = await gatherLeadResearch({
      websiteUrls: [],
      search: { objective: "o", queries: ["q"] },
      searchOutside,
    });
    expect(gathered.outside.map((r) => r.url)).toEqual(["https://techcrunch.com/cosmic-labs"]);
  });

  it("asks the providers not to return them in the first place", () => {
    expect(UNQUOTABLE_SOURCE_HOSTS).toContain("prospeo.io");
    expect(UNQUOTABLE_SOURCE_HOSTS).toContain("linkedin.com");
  });
});

/**
 * "But it just searches the website." The monar card carried three findings,
 * 73/100, and every one of them headed OBSERVED ON THEIR SITE.
 */
describe("the outside providers are asked a question they can answer", () => {
  it("names the domain, not only the company", () => {
    /*
     * "monar", "Vector", "Context", "Cosmic Labs" each match a large part of
     * the web that is not the prospect. The domain is the one token that
     * means this company and no other.
     */
    for (const query of leadResearchQueries("monar", "monar.com")) {
      expect(query, query).toContain("monar.com");
    }
    for (const query of companyProfileQueries("monar", "https://www.monar.com/")) {
      expect(query, query).toContain("monar.com");
    }
  });

  it("still works for a lead with no website", () => {
    const queries = leadResearchQueries("Cosmic Labs", "");
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) expect(query).toContain("Cosmic Labs");
  });

  it("asks Context.dev about the company, not about its press", () => {
    /*
     * Context.dev does firmographics and branding. It was receiving the
     * identical news queries Parallel gets, so a company with no press
     * answered none of them and research collapsed to the website.
     */
    const news = leadResearchQueries("monar", "monar.com").join(" ").toLowerCase();
    const profile = companyProfileQueries("monar", "monar.com").join(" ").toLowerCase();
    expect(news).toContain("funding");
    expect(profile).not.toContain("funding");
    expect(profile).toMatch(/what the company does|industry|positioning/);
  });

  it("routes the profile queries to Context.dev and the news queries to Parallel", () => {
    /*
     * Asserted against the module itself rather than a stub: a test that
     * stands up its own fake provider and then checks the fake proves
     * nothing about which options the real call receives.
     */
    const src = readFileSync("supabase/functions/_shared/external-research.ts", "utf8")
      .split("\n").filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("/*")).join("\n");
    expect(src).toContain("opts.contextQueries?.length");
    expect(src).toContain("{ ...opts, queries: opts.contextQueries }");
    expect(src).toContain("parallelSearch(opts)");
    expect(src).toContain("contextDevSearch(contextOpts)");
  });

  it("behaves exactly as before when no profile queries are given", () => {
    const src = readFileSync("supabase/functions/_shared/external-research.ts", "utf8");
    // The fallback is the same object, so an un-migrated caller is unchanged.
    expect(src).toContain(": opts;");
  });
});
