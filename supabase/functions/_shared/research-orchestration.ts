/**
 * When generation may call research-lead, and what that call is allowed to mean.
 *
 * A fresh model brief is not evidence. If this lead has no service-written
 * snapshot and the last retrieval is outside the short retry window, generation
 * calls research-lead once. A retry inside that window reads the receipt and
 * holds. It does not call Parallel or Context.dev again.
 *
 * Firecrawl is the lead-site reader. A direct page fetch is not recorded as
 * Firecrawl. Parallel and Context run after the site read, including when it
 * succeeds. A missing key is not_configured and does not invent a page.
 */

export const RETRY_WINDOW_MS = 10 * 60 * 1000;

export interface ProviderAttempt {
  configured: boolean;
  called: boolean;
  error: string | null;
  count: number;
}

export interface RetrievalReceipt {
  attemptedAt: string;
  site: ProviderAttempt & { statuses: number[]; finalHosts: string[] };
  parallel: ProviderAttempt;
  context_dev: ProviderAttempt;
  firecrawl: ProviderAttempt;
  snapshotWrite: "written" | "failed" | "none";
}

export type ResearchStep = "use" | "fetch" | "hold";

/**
 * What begin_research_run's reply means.
 *
 * A missing function used to look like "a run already happened": the client
 * ignored the RPC error, saw a null id, and returned the hold response. Every
 * lead then counted as not researched. An error is not a hold. Null with no
 * error is the real cooldown.
 */
export function researchReservation(
  data: unknown,
  errorMessage: string | null | undefined,
  force: boolean,
): { runId: string | null; hold: boolean } {
  if (errorMessage) return { runId: null, hold: false };
  const runId = typeof data === "string" && data ? data : null;
  return { runId, hold: !runId && !force };
}

export function researchAction(input: { step: ResearchStep; force: boolean; fresh: boolean }): "hold" | "cache" | "fetch" {
  if (!input.force && input.step === "hold") return "hold";
  if (!input.force && input.step !== "fetch" && input.fresh) return "cache";
  return "fetch";
}

export function researchStep(input: {
  hasTrustedFacts: boolean;
  receipt: RetrievalReceipt | null;
  now: string;
  force?: boolean;
}): ResearchStep {
  if (input.force) return "fetch";
  if (input.hasTrustedFacts) return "use";
  const attempted = Date.parse(input.receipt?.attemptedAt ?? "");
  if (Number.isFinite(attempted) && Date.parse(input.now) - attempted < RETRY_WINDOW_MS) return "hold";
  return "fetch";
}

export function emptyReceipt(now: string): RetrievalReceipt {
  const none = { configured: false, called: false, error: null, count: 0 };
  return {
    attemptedAt: now,
    site: { ...none, statuses: [], finalHosts: [] },
    parallel: { ...none },
    context_dev: { ...none },
    firecrawl: { configured: false, called: false, error: "not_configured", count: 0 },
    snapshotWrite: "none",
  };
}

export function receiptFromProviders(input: {
  now: string;
  parallelConfigured: boolean;
  parallelError: string | null;
  parallelCount: number;
  contextConfigured: boolean;
  contextError: string | null;
  contextCount: number;
  siteStatuses: number[];
  siteHosts: string[];
  firecrawlConfigured: boolean;
  firecrawlError: string | null;
  firecrawlCount: number;
  snapshotWrite: RetrievalReceipt["snapshotWrite"];
}): RetrievalReceipt {
  return {
    attemptedAt: input.now,
    site: {
      configured: true,
      called: true,
      error: input.siteStatuses.some((status) => status >= 200 && status < 300) ? null : "no_page",
      count: input.siteStatuses.filter((status) => status >= 200 && status < 300).length,
      statuses: input.siteStatuses,
      finalHosts: input.siteHosts,
    },
    parallel: {
      configured: input.parallelConfigured,
      called: input.parallelConfigured,
      error: input.parallelConfigured ? input.parallelError : "not_configured",
      count: input.parallelCount,
    },
    context_dev: {
      configured: input.contextConfigured,
      called: input.contextConfigured,
      error: input.contextConfigured ? input.contextError : "not_configured",
      count: input.contextCount,
    },
    firecrawl: {
      configured: input.firecrawlConfigured,
      called: input.firecrawlConfigured,
      error: input.firecrawlConfigured ? input.firecrawlError : "not_configured",
      count: input.firecrawlCount,
    },
    snapshotWrite: input.snapshotWrite,
  };
}

export function holdReason(receipt: RetrievalReceipt | null): string {
  if (!receipt) return "No retrieved page is stored for this lead, so nothing was drafted.";
  const parts = [
    receipt.parallel.configured
      ? `Parallel ${receipt.parallel.error ? `failed (${receipt.parallel.error})` : `returned ${receipt.parallel.count}`}`
      : "Parallel is not configured",
    receipt.context_dev.configured
      ? `Context.dev ${receipt.context_dev.error ? `failed (${receipt.context_dev.error})` : `returned ${receipt.context_dev.count}`}`
      : "Context.dev is not configured",
    receipt.firecrawl.configured
      ? `Firecrawl ${receipt.firecrawl.error ? `failed (${receipt.firecrawl.error})` : `returned ${receipt.firecrawl.count}`}`
      : "Firecrawl is not configured (FIRECRAWL_API_KEY)",
    receipt.site.error ? "no approved site sentence was stored" : `stored ${receipt.site.count} site page(s)`,
  ];
  return `Research ran and did not produce an approved sentence, so nothing was drafted. ${parts.join("; ")}.`;
}
