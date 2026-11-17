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
  /** Which reader produced the text. "site" is our own direct fetch, used only when Firecrawl was rate limited or down. */
  via: "firecrawl" | "site";
}

/** Firecrawl rate-limits bursts; a lead site has up to 8 pages and jobs run leads in parallel. */
const SCRAPE_CONCURRENCY = 2;
const RETRY_DELAYS_MS = [1_500, 4_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function scrapeWithRetry(
  url: string,
  scrape: (url: string) => Promise<FirecrawlPage>,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<FirecrawlPage> {
  let page = await scrape(url);
  for (const delay of RETRY_DELAYS_MS) {
    if (page.error !== "http_429" && page.error !== "unreachable" && !(page.status >= 500)) return page;
    await wait(delay + Math.floor(Math.random() * 500));
    page = await scrape(url);
  }
  return page;
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
  /** Direct read of a page, used only when every Firecrawl read failed for a transient reason. */
  directFetch?: (url: string) => Promise<{ ok: boolean; status: number; finalUrl: string; html: string }>;
  wait?: (ms: number) => Promise<void>;
  searchOutside?: typeof externalResearchSearch;
}): Promise<GatheredResearch> {
  const scrape = input.scrape ?? firecrawlScrape;
  const searchOutside = input.searchOutside ?? externalResearchSearch;
  const sitePages: GatheredSitePage[] = [];
  let firecrawlError: string | null = null;
  let configured = true;
  const scraped: FirecrawlPage[] = new Array(input.websiteUrls.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(SCRAPE_CONCURRENCY, input.websiteUrls.length) }, async () => {
      while (next < input.websiteUrls.length) {
        const i = next++;
        scraped[i] = await scrapeWithRetry(input.websiteUrls[i], scrape, input.wait);
      }
    }),
  );
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
        via: "firecrawl",
      });
    }
    if (sitePages.length) firecrawlError = null;
    // Firecrawl was rate limited or down for every page. Read the main pages
    // ourselves so the brief still has the prospect's own words, labeled as a
    // direct site read rather than Firecrawl.
    if (!sitePages.length && input.directFetch && input.websiteUrls.length) {
      for (const url of input.websiteUrls.slice(0, 3)) {
        try {
          const got = await input.directFetch(url);
          if (got.ok && got.html.trim()) {
            sitePages.push({ requestedUrl: url, finalUrl: got.finalUrl || url, status: got.status || 200, text: got.html, via: "site" });
          }
        } catch { /* keep going */ }
      }
    }
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
