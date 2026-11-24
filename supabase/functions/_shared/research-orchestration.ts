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

export type ProviderStatus = "ok" | "empty" | "error" | "skipped";

export interface ProviderAttempt {
  configured: boolean;
  called: boolean;
  error: string | null;
  /** Search hits or pages read. Not the same as a sentence we could store. */
  count: number;
  /** ok: a usable page was stored. empty: the call returned nothing usable. error: the call failed. skipped: it was not run. */
  status?: ProviderStatus;
  stored?: number;
}

export function providerStatus(input: {
  configured: boolean;
  called: boolean;
  error: string | null;
  stored: number;
}): ProviderStatus {
  if (!input.configured || !input.called) return "skipped";
  if (input.stored > 0) return "ok";
  if (input.error) return "error";
  return "empty";
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
  /** False when the lead has no website, so Firecrawl is skipped rather than reported as an empty read. */
  firecrawlCalled?: boolean;
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
      called: input.firecrawlCalled ?? input.firecrawlConfigured,
      error: input.firecrawlConfigured ? input.firecrawlError : "not_configured",
      count: input.firecrawlCount,
    },
    snapshotWrite: input.snapshotWrite,
  };
}

/**
 * Fill status from the pages that were actually stored. A search hit that
 * never became a readable page is empty, not ok.
 */
export function annotateProviderStatuses(
  receipt: RetrievalReceipt,
  snapshots: { provider: string; providerOk: boolean; partial: boolean }[],
): RetrievalReceipt {
  const stored = (provider: string) => snapshots.filter((snap) => snap.provider === provider && snap.providerOk && !snap.partial).length;
  const apply = (attempt: ProviderAttempt, provider: string): ProviderAttempt => {
    const n = stored(provider);
    return { ...attempt, stored: n, status: providerStatus({ ...attempt, stored: n }) };
  };
  return {
    ...receipt,
    site: { ...apply(receipt.site, "site"), statuses: receipt.site.statuses, finalHosts: receipt.site.finalHosts },
    parallel: apply(receipt.parallel, "parallel"),
    context_dev: apply(receipt.context_dev, "context_dev"),
    firecrawl: apply(receipt.firecrawl, "firecrawl"),
  };
}

export function holdReason(receipt: RetrievalReceipt | null): string {
  if (!receipt) return "No retrieved page is stored for this lead, so nothing was drafted.";
  const parts = [
    /*
     * The outside providers name their own keys when they are off, the way
     * Firecrawl already did.
     *
     * These two are the answer to a lead with no website: research-lead only
     * refuses when there is neither a site nor a company name, and the outside
     * search runs with an empty websiteUrls list. So when a website-less lead
     * comes back with nothing, which of these is switched off IS the
     * diagnosis, and "Parallel is not configured" did not say what to set.
     * Context.dev needs three, and a half-configured one reads identically to
     * an absent one from here.
     */
    receipt.parallel?.configured
      ? `Parallel ${receipt.parallel?.error ? `failed (${receipt.parallel?.error})` : `returned ${receipt.parallel?.count ?? 0}`}`
      : "Parallel is not configured (PARALLEL_API_KEY)",
    receipt.context_dev?.configured
      ? `Context.dev ${receipt.context_dev?.error ? `failed (${receipt.context_dev?.error})` : `returned ${receipt.context_dev?.count ?? 0}`}`
      : "Context.dev is not configured (CONTEXT_DEV_GATEWAY_URL, UDC_CONTEXT_DEV_API_KEY, LOVABLE_API_KEY)",
    receipt.firecrawl?.configured
      ? `Firecrawl ${receipt.firecrawl?.error ? `failed (${receipt.firecrawl?.error})` : `returned ${receipt.firecrawl?.count ?? 0}`}`
      : "Firecrawl is not configured (FIRECRAWL_API_KEY)",
    receipt.site?.error ? "the company site could not be read" : `read ${receipt.site?.count ?? 0} company site page(s)`,
    receipt.snapshotWrite === "written"
      ? "no stored page had a sentence that names this company and can be quoted as-is"
      : "no page could be stored as evidence",
  ];
  return `Research ran and did not produce an approved sentence, so nothing was drafted. ${parts.join("; ")}.`;
}
