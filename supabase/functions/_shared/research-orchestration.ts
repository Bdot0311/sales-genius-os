/**
 * When generation may call research-lead, and what that call is allowed to mean.
 *
 * A fresh model brief is not evidence. If this lead has no service-written
 * snapshot and the last retrieval is outside the short retry window, generation
 * calls research-lead once. A retry inside that window reads the receipt and
 * holds. It does not call Parallel or Context.dev again.
 *
 * Firecrawl has no adapter in this repository. The receipt says so. A site
 * fetch is not recorded as Firecrawl.
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
  firecrawl: { configured: false; called: false; reason: "no adapter in this repository" };
  snapshotWrite: "written" | "failed" | "none";
}

export type ResearchStep = "use" | "fetch" | "hold";

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
    firecrawl: { configured: false, called: false, reason: "no adapter in this repository" },
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
    firecrawl: { configured: false, called: false, reason: "no adapter in this repository" },
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
    "Firecrawl has no adapter in this app",
    receipt.site.error ? "the company site fetch did not yield an approved sentence" : `the site fetch stored ${receipt.site.count} page(s)`,
  ];
  return `Research ran and did not produce an approved sentence, so nothing was drafted. ${parts.join("; ")}.`;
}
