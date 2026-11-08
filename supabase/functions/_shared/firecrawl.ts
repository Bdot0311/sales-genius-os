/**
 * Firecrawl reads the lead's own site.
 *
 * Documented call: POST https://api.firecrawl.dev/v1/scrape
 * Authorization: Bearer $FIRECRAWL_API_KEY
 * Body: { url, formats: ["markdown"], onlyMainContent: true }
 * A missing key returns not_configured and does not send HTTP.
 * This file is the adapter. It is not evidence that a hosted project has a key.
 */

const SCRAPE_URL = "https://api.firecrawl.dev/v1/scrape";

export interface FirecrawlPage {
  ok: boolean;
  markdown: string;
  sourceUrl: string;
  status: number;
  error: string | null;
}

export function firecrawlConfigured(env: { get(name: string): string | undefined } = Deno.env): boolean {
  return Boolean(env.get("FIRECRAWL_API_KEY"));
}

export async function firecrawlScrape(
  url: string,
  deps: { fetchImpl?: typeof fetch; apiKey?: string | null } = {},
): Promise<FirecrawlPage> {
  const apiKey = deps.apiKey === undefined ? Deno.env.get("FIRECRAWL_API_KEY") : deps.apiKey;
  if (!apiKey) return { ok: false, markdown: "", sourceUrl: url, status: 0, error: "not_configured" };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchImpl(SCRAPE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, markdown: "", sourceUrl: url, status: response.status, error: `http_${response.status}` };
    }
    const body = await response.json() as { success?: boolean; data?: { markdown?: unknown; metadata?: { sourceURL?: unknown; statusCode?: unknown } } };
    const markdown = typeof body.data?.markdown === "string" ? body.data.markdown.trim() : "";
    const source = typeof body.data?.metadata?.sourceURL === "string" ? body.data.metadata.sourceURL : url;
    const status = typeof body.data?.metadata?.statusCode === "number" ? body.data.metadata.statusCode : response.status;
    if (!body.success || !markdown) {
      return { ok: false, markdown: "", sourceUrl: source, status, error: "empty" };
    }
    return { ok: true, markdown, sourceUrl: source, status, error: null };
  } catch {
    return { ok: false, markdown: "", sourceUrl: url, status: 0, error: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
