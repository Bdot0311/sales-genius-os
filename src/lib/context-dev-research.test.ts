import { afterEach, describe, expect, it, vi } from "vitest";
import { contextDevSearch, normalizeContextResults } from "../../supabase/functions/_shared/context-dev";
import { externalResearchSearch, mergeResearchResults } from "../../supabase/functions/_shared/external-research";

declare global {
  var Deno: { env: { get(name: string): string | undefined } };
}

afterEach(() => vi.unstubAllGlobals());
const source = (url: string) => ({ url, title: url, publish_date: "", excerpts: ["A real search excerpt"] });
describe("Context.dev supplements existing research", () => {
  it("keeps checkable URLs and never invents publication dates", () => {
    expect(normalizeContextResults({ results: [{ url: "https://news.example/story", title: "Launch", description: "New release" }] })).toEqual([
      { url: "https://news.example/story", title: "Launch", publish_date: "", excerpts: ["New release"] },
    ]);
  });
  it("excludes the prospect's own domain, subdomains and unsafe URLs", () => {
    expect(normalizeContextResults({ results: ["https://www.acme.test/news", "https://blog.acme.test/story", "javascript:alert(1)"].map((url) => ({ url, description: "snippet" })) }, ["acme.test"])).toEqual([]);
  });
  it("includes both providers and deduplicates URLs", () => {
    expect(mergeResearchResults([source("https://a.test/story"), source("https://b.test/story")], [source("https://a.test/story#top"), source("https://c.test/story")], 3).map((r) => r.url)).toEqual(["https://a.test/story", "https://b.test/story", "https://c.test/story"]);
  });
  it("uses the gateway and returns a safe failure instead of blocking research", async () => {
    vi.stubGlobal("Deno", { env: { get: (name: string) => ({ CONTEXT_DEV_GATEWAY_URL: "https://gateway.example/context", LOVABLE_API_KEY: "test-app", UDC_CONTEXT_DEV_API_KEY: "test-connection" }[name]) } });
    const request = vi.fn().mockResolvedValue(new Response("rejected", { status: 403 }));
    vi.stubGlobal("fetch", request);
    expect(await contextDevSearch({ objective: "news", queries: ["Acme launch"], excludeDomains: ["acme.test"] })).toEqual({ results: [], error: "http_403" });
    expect(request.mock.calls[0][0]).toBe("https://gateway.example/context/v1/web/search");
    expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({ query: "Acme launch", excludeDomains: ["acme.test"] });
  });
  it("preserves Parallel results when Context.dev is unavailable", async () => {
    vi.stubGlobal("Deno", { env: { get: (name: string) => name === "PARALLEL_API_KEY" ? "test-parallel" : undefined } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [source("https://news.test/story")] }), { status: 200 })));
    const result = await externalResearchSearch({ objective: "news", queries: ["Acme news"] });
    expect(result.error).toBeNull();
    expect(result.results[0].url).toBe("https://news.test/story");
    expect(result.providers.context_dev.error).toBe("not_configured");
  });
});