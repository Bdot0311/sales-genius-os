/**
 * One research run reads the lead site with Firecrawl, then asks Parallel and
 * Context for outside sources. A successful site read does not skip that step.
 * Neither search result is an approved sentence until its page is fetched.
 */

import { firecrawlScrape, type FirecrawlPage } from "./firecrawl.ts";
import { externalResearchSearch } from "./external-research.ts";
import type { ParallelResult, ParallelSearchOptions } from "./parallel.ts";

export interface GatheredSitePage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  text: string;
}

export interface GatheredResearch {
  sitePages: GatheredSitePage[];
  outside: ParallelResult[];
  firecrawlError: string | null;
  firecrawlConfigured: boolean;
  providers: {
    parallel: { error: string | null; sources: number };
    context_dev: { error: string | null; sources: number };
  };
}

export async function gatherLeadResearch(input: {
  websiteUrls: string[];
  search: ParallelSearchOptions;
  scrape?: (url: string) => Promise<FirecrawlPage>;
  searchOutside?: typeof externalResearchSearch;
}): Promise<GatheredResearch> {
  const scrape = input.scrape ?? firecrawlScrape;
  const searchOutside = input.searchOutside ?? externalResearchSearch;
  const sitePages: GatheredSitePage[] = [];
  let firecrawlError: string | null = null;
  let configured = true;
  const scraped = await Promise.all(input.websiteUrls.map((url) => scrape(url)));
  if (scraped.some((page) => page.error === "not_configured")) {
    configured = false;
    firecrawlError = "not_configured";
  } else {
    for (let i = 0; i < scraped.length; i++) {
      const page = scraped[i];
      const url = input.websiteUrls[i];
      if (!page.ok || !page.markdown.trim()) {
        firecrawlError = page.error;
        continue;
      }
      sitePages.push({
        requestedUrl: url,
        finalUrl: page.sourceUrl || url,
        status: page.status || 200,
        text: page.markdown,
      });
    }
    if (sitePages.length) firecrawlError = null;
  }
  // Website success, failure, and a missing key all continue to both outside providers.
  const external = await searchOutside(input.search);
  const seen = new Set<string>();
  const outside = external.results.filter((result) => {
    const key = result.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    sitePages,
    outside,
    firecrawlError: configured ? firecrawlError : "not_configured",
    firecrawlConfigured: configured,
    providers: external.providers,
  };
}
