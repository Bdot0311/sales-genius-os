import { describe, expect, it } from "vitest";
import { firecrawlScrape } from "../../supabase/functions/_shared/firecrawl";
import { gatherLeadResearch } from "../../supabase/functions/_shared/research-gather";
import { evaluateStoredSnapshots, sealSnapshot } from "../../supabase/functions/_shared/evidence-contract";
import type { ParallelResult } from "../../supabase/functions/_shared/parallel";

const NOW = "2026-11-07T12:00:00.000Z";
const USER = "11111111-1111-4111-8111-111111111111";
const LEAD = "22222222-2222-4222-8222-222222222222";
const SITE = "TF Business Solutions hires freight brokers for shippers across the region.";
const PARALLEL = "TF Business Solutions opened a yard for freight brokers across the region.";
const CONTEXT = "TF Business Solutions listed two hubs for freight brokers across the region.";

const search = {
  objective: "outside",
  queries: ["TF freight"],
};

function outside(url: string, provider: "parallel" | "context_dev"): ParallelResult {
  return { url, title: provider, publish_date: "2026-01-01", excerpts: ["excerpt"], provider };
}

describe("one run keeps Firecrawl, Parallel, and Context", () => {
  it("still asks both outside providers after the website returns text", async () => {
    let scraped = 0;
    let searched = 0;
    const gathered = await gatherLeadResearch({
      websiteUrls: ["https://tf.example/"],
      search,
      scrape: async () => {
        scraped += 1;
        return { ok: true, markdown: SITE, sourceUrl: "https://tf.example/", status: 200, error: null };
      },
      searchOutside: async () => {
        searched += 1;
        expect(scraped).toBe(1);
        return {
          results: [outside("https://news.example/a", "parallel"), outside("https://wire.example/b", "context_dev")],
          sessionId: null,
          error: null,
          providers: {
            parallel: { error: null, sources: 1 },
            context_dev: { error: null, sources: 1 },
          },
        };
      },
    });
    expect(searched).toBe(1);
    expect(gathered.sitePages.map((page) => page.text)).toEqual([SITE]);
    expect(gathered.outside.map((row) => row.provider)).toEqual(["parallel", "context_dev"]);
    expect(gathered.firecrawlError).toBeNull();
  });

  it("does not invent a site page when Firecrawl is not configured, and still searches", async () => {
    let searched = 0;
    const gathered = await gatherLeadResearch({
      websiteUrls: ["https://tf.example/", "https://tf.example/about"],
      search,
      scrape: async () => ({ ok: false, markdown: "", sourceUrl: "", status: 0, error: "not_configured" }),
      searchOutside: async () => {
        searched += 1;
        return {
          results: [outside("https://news.example/a", "parallel")],
          sessionId: null,
          error: null,
          providers: {
            parallel: { error: null, sources: 1 },
            context_dev: { error: "not_configured", sources: 0 },
          },
        };
      },
    });
    expect(searched).toBe(1);
    expect(gathered.sitePages).toEqual([]);
    expect(gathered.firecrawlConfigured).toBe(false);
    expect(gathered.firecrawlError).toBe("not_configured");
  });

  it("stores a failed provider as an error and does not approve an empty page", async () => {
    const gathered = await gatherLeadResearch({
      websiteUrls: ["https://tf.example/"],
      search,
      scrape: async () => ({ ok: false, markdown: "", sourceUrl: "https://tf.example/", status: 500, error: "http_500" }),
      searchOutside: async () => ({
        results: [],
        sessionId: null,
        error: "http_401",
        providers: {
          parallel: { error: "http_401", sources: 0 },
          context_dev: { error: "http_503", sources: 0 },
        },
      }),
    });
    expect(gathered.sitePages).toEqual([]);
    expect(gathered.firecrawlError).toBe("http_500");
    expect(gathered.providers.parallel.error).toBe("http_401");
    expect(gathered.providers.context_dev.error).toBe("http_503");
  });

  it("approves one sentence from each provider and drops a repeated outside URL", async () => {
    const gathered = await gatherLeadResearch({
      websiteUrls: ["https://tf.example/"],
      search,
      scrape: async () => ({ ok: true, markdown: SITE, sourceUrl: "https://tf.example/", status: 200, error: null }),
      searchOutside: async () => ({
        results: [
          outside("https://news.example/a", "parallel"),
          outside("https://news.example/a/", "parallel"),
          outside("https://wire.example/b", "context_dev"),
        ],
        sessionId: null,
        error: null,
        providers: {
          parallel: { error: null, sources: 2 },
          context_dev: { error: null, sources: 1 },
        },
      }),
    });
    expect(gathered.outside).toHaveLength(2);
    const pages = [
      { provider: "firecrawl" as const, role: "prospect_page" as const, url: "https://tf.example/", text: SITE },
      { provider: "parallel" as const, role: "external" as const, url: "https://news.example/a", text: PARALLEL },
      { provider: "context_dev" as const, role: "external" as const, url: "https://wire.example/b", text: CONTEXT },
    ];
    const decision = evaluateStoredSnapshots({
      userId: USER,
      leadId: LEAD,
      company: "TF Business Solutions",
      websiteHost: "tf.example",
      now: NOW,
      stored: pages.map((page) => sealSnapshot({
        userId: USER,
        leadId: LEAD,
        provider: page.provider,
        role: page.role,
        requestedUrl: page.url,
        finalUrl: page.url,
        pageStatus: 200,
        excerpt: page.text,
        retrievedAt: NOW,
        publishedAt: null,
        providerOk: true,
        partial: false,
        fromCache: false,
      })),
    });
    expect(decision.status).toBe("ready");
    expect(decision.facts.map((fact) => fact.provider).sort()).toEqual(["context_dev", "firecrawl", "parallel"]);
    expect(decision.facts.map((fact) => fact.span).join(" ")).toContain("hires freight brokers");
    expect(decision.facts.map((fact) => fact.span).join(" ")).toContain("opened a yard");
    expect(decision.facts.map((fact) => fact.span).join(" ")).toContain("listed two hubs");
  });
});

describe("the Firecrawl adapter does not pretend", () => {
  it("does not call the network when the key is missing", async () => {
    let called = 0;
    const page = await firecrawlScrape("https://tf.example/", {
      apiKey: null,
      fetchImpl: (async () => {
        called += 1;
        return new Response("no");
      }) as typeof fetch,
    });
    expect(called).toBe(0);
    expect(page.error).toBe("not_configured");
    expect(page.markdown).toBe("");
  });

  it("sends the documented scrape and keeps a failure empty", async () => {
    const calls: string[] = [];
    const ok = await firecrawlScrape("https://tf.example/", {
      apiKey: "test-key",
      fetchImpl: (async (url: string, init?: RequestInit) => {
        calls.push(String(url));
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-key");
        expect(String(init?.body)).toContain("\"formats\":[\"markdown\"]");
        return new Response(JSON.stringify({
          success: true,
          data: { markdown: SITE, metadata: { sourceURL: "https://tf.example/", statusCode: 200 } },
        }), { status: 200 });
      }) as typeof fetch,
    });
    expect(calls).toEqual(["https://api.firecrawl.dev/v1/scrape"]);
    expect(ok.ok).toBe(true);
    expect(ok.markdown).toContain("hires freight brokers");
    const failed = await firecrawlScrape("https://tf.example/", {
      apiKey: "test-key",
      fetchImpl: (async () => new Response("no", { status: 401 })) as typeof fetch,
    });
    expect(failed.ok).toBe(false);
    expect(failed.error).toBe("http_401");
    expect(failed.markdown).toBe("");
  });
});
