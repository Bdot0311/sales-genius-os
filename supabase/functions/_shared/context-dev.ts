import type { ParallelResult, ParallelSearchOptions } from "./parallel.ts";

export function contextDevConfigured(): boolean {
  return Boolean(Deno.env.get("CONTEXT_DEV_GATEWAY_URL") && Deno.env.get("LOVABLE_API_KEY") && Deno.env.get("UDC_CONTEXT_DEV_API_KEY"));
}

export function normalizeContextResults(data: unknown, excluded: string[] = []): ParallelResult[] {
  if (!data || typeof data !== "object" || !("results" in data) || !Array.isArray(data.results)) return [];
  const blocked = excluded.map((domain) => domain.toLowerCase().replace(/^www\./, ""));
  return data.results.flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    if (typeof r.url !== "string") return [];
    let url: URL;
    try { url = new URL(r.url); } catch { return []; }
    if (!['https:', 'http:'].includes(url.protocol)) return [];
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (blocked.some((domain) => host === domain || host.endsWith(`.${domain}`))) return [];
    const excerpts = typeof r.description === "string" && r.description.trim()
      ? [r.description.replace(/\s+/g, " ").trim().slice(0, 1200)] : [];
    if (!excerpts.length) return [];
    // Search descriptions have no documented publication date. Never invent one.
    return [{ url: url.href, title: typeof r.title === "string" ? r.title.slice(0, 300) : "", publish_date: "", excerpts }];
  });
}

export async function contextDevSearch(opts: ParallelSearchOptions): Promise<{ results: ParallelResult[]; error: string | null }> {
  const base = Deno.env.get("CONTEXT_DEV_GATEWAY_URL");
  const appKey = Deno.env.get("LOVABLE_API_KEY");
  const connectionKey = Deno.env.get("UDC_CONTEXT_DEV_API_KEY");
  if (!base || !appKey || !connectionKey) return { results: [], error: "not_configured" };
  const query = opts.queries.map((q) => q.trim()).filter(Boolean).join(" OR ").slice(0, 500);
  if (!query) return { results: [], error: "no_queries" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/v1/web/search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${appKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ query, numResults: opts.maxResults ?? 8, excludeDomains: opts.excludeDomains ?? [], descriptionMaxCharacters: 1200 }),
    });
    if (!response.ok) {
      // Do not log provider bodies, which can echo credentials. Keep safe status metadata.
      await response.body?.cancel();
      return { results: [], error: `http_${response.status}` };
    }
    return { results: normalizeContextResults(await response.json(), opts.excludeDomains), error: null };
  } catch {
    return { results: [], error: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}