// Parallel Web Systems — live web research for a lead.
//
// Why: the lead brief was built from the prospect's own website only. A
// marketing site says the same thing to every visitor and rarely carries a
// date, so most observations came back undated and the writer is forbidden to
// imply recency on an undated fact. Parallel's search API returns excerpts with
// a publish_date and a citable URL, which is exactly the shape the brief needs.
//
// Contract: POST https://api.parallel.ai/v1/search with an `x-api-key` header.
// Body is { objective, search_queries[], mode, max_chars_total, advanced_settings }.
// Response is { search_id, session_id, results: [{ url, title, publish_date,
// excerpts[] }] }.  See https://docs.parallel.ai/public-openapi.json
//
// Never throws and never blocks research: a failure returns an empty result set
// and the brief is built from whatever else was gathered.

const SEARCH_URL = "https://api.parallel.ai/v1/search";

export interface ParallelResult {
  url: string;
  title: string;
  /** YYYY-MM-DD when the source published it, "" when unknown. */
  publish_date: string;
  excerpts: string[];
}

export function parallelConfigured(): boolean {
  return !!Deno.env.get("PARALLEL_API_KEY");
}

export interface ParallelSearchOptions {
  /** Self-contained description of what we are trying to learn. */
  objective: string;
  /** Concise keyword queries, 3-6 words each. 2-3 gives the best results. */
  queries: string[];
  maxResults?: number;
  maxCharsTotal?: number;
  /** turbo | fast | basic | advanced. Defaults to "basic" for latency. */
  mode?: "turbo" | "fast" | "basic" | "advanced";
  /**
   * Domains to keep out of the results. The lead's own site belongs here: we
   * read it directly and in full, so spending result slots on it crowds out the
   * independent, dated coverage this call exists to find.
   */
  excludeDomains?: string[];
  timeoutMs?: number;
  /** Ties several calls in one research run together for better context. */
  sessionId?: string | null;
}

export async function parallelSearch(
  opts: ParallelSearchOptions,
): Promise<{ results: ParallelResult[]; sessionId: string | null; error: string | null }> {
  const key = Deno.env.get("PARALLEL_API_KEY");
  if (!key) return { results: [], sessionId: null, error: "not_configured" };

  const queries = opts.queries.map((q) => q.trim()).filter(Boolean).slice(0, 4);
  if (!queries.length) return { results: [], sessionId: null, error: "no_queries" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        objective: opts.objective.slice(0, 2_000),
        search_queries: queries,
        mode: opts.mode ?? "basic",
        max_chars_total: opts.maxCharsTotal ?? 6_000,
        ...(opts.sessionId ? { session_id: opts.sessionId } : {}),
        advanced_settings: {
          max_results: opts.maxResults ?? 8,
          ...(opts.excludeDomains?.length
            ? { source_policy: { exclude_domains: opts.excludeDomains.slice(0, 20) } }
            : {}),
        },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[parallel] search failed ${res.status}`, detail.slice(0, 400));
      return { results: [], sessionId: null, error: `http_${res.status}` };
    }

    const data = await res.json() as {
      session_id?: string;
      results?: { url?: string; title?: string | null; publish_date?: string | null; excerpts?: string[] }[];
    };

    const results: ParallelResult[] = (data.results ?? [])
      .filter((r) => typeof r?.url === "string" && r.url)
      .map((r) => ({
        url: String(r.url),
        title: typeof r.title === "string" ? r.title.trim().slice(0, 300) : "",
        publish_date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.publish_date ?? ""))
          ? String(r.publish_date)
          : "",
        excerpts: (r.excerpts ?? [])
          .filter((e) => typeof e === "string" && e.trim())
          .map((e) => e.replace(/\s+/g, " ").trim().slice(0, 1_200))
          .slice(0, 3),
      }))
      .filter((r) => r.excerpts.length);

    return { results, sessionId: data.session_id ?? null, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[parallel] search unavailable:", msg);
    return { results: [], sessionId: null, error: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

/** The queries worth running for one company. Keyword-style, 3-6 words each. */
export function leadResearchQueries(company: string, host: string): string[] {
  const name = (company || host).replace(/\s+/g, " ").trim().slice(0, 60);
  return [
    `${name} funding announcement news`,
    `${name} product launch announcement`,
    `${name} hiring expansion news`,
  ];
}

/**
 * The block handed to the brief writer. Every line carries its source URL and,
 * when the publisher stated one, its publish date — so an observation built on
 * it can legitimately be dated.
 */
export function parallelPromptBlock(results: ParallelResult[]): string {
  if (!results.length) return "";
  const lines = results.slice(0, 8).map((r) => {
    const head = [r.title || r.url, r.publish_date ? `published ${r.publish_date}` : "publish date unknown"]
      .join(" — ");
    return `--- WEB SOURCE: ${r.url} (${head}) ---\n${r.excerpts.join("\n")}`;
  });
  return [
    "EXTERNAL WEB RESEARCH (independent sources, not the company's own site).",
    "Each source below carries its URL and, where the publisher stated one, its publish date.",
    "An observation built on one of these MUST use that URL as its source, and may use that publish date as its `occurred`.",
    "",
    ...lines,
  ].join("\n");
}
