import { parallelConfigured, parallelSearch, type ParallelResult, type ParallelSearchOptions } from "./parallel.ts";
import { contextDevConfigured, contextDevSearch } from "./context-dev.ts";

export function externalResearchConfigured(): boolean {
  return parallelConfigured() || contextDevConfigured();
}

export function mergeResearchResults(primary: ParallelResult[], supplementary: ParallelResult[], max = 8): ParallelResult[] {
  const seen = new Set<string>();
  // Interleave so a full primary result set cannot crowd out the supplementary source.
  const merged: ParallelResult[] = [];
  for (let i = 0; i < Math.max(primary.length, supplementary.length); i++) {
    for (const result of [primary[i], supplementary[i]]) {
      if (!result) continue;
      const canonical = result.url.replace(/#.*$/, "").replace(/\/$/, "");
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      merged.push(result);
    }
  }
  return merged.slice(0, max);
}

export async function externalResearchSearch(opts: ParallelSearchOptions) {
  const [parallel, context] = await Promise.all([parallelSearch(opts), contextDevSearch(opts)]);
  return {
    results: mergeResearchResults(
      parallel.results.map((result) => ({ ...result, provider: "parallel" as const })),
      context.results.map((result) => ({ ...result, provider: "context_dev" as const })),
      opts.maxResults ?? 8,
    ),
    sessionId: parallel.sessionId,
    error: parallel.error === null || context.error === null ? null
      : parallel.error === "not_configured" ? context.error : parallel.error,
    providers: { parallel: { error: parallel.error, sources: parallel.results.length }, context_dev: { error: context.error, sources: context.results.length } },
  };
}