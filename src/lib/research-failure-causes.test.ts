import { describe, expect, it } from "vitest";
import { holdReason } from "../../supabase/functions/_shared/research-orchestration";
import { classifyFailure as workerClassify } from "../../supabase/functions/_shared/bulk-run-logic";
import { classifyFailure } from "./draft-failures";

/**
 * "11 failed — 11 research found nothing usable to quote."
 *
 * One sentence carried five different outcomes. holdReason already reported
 * why research came back empty — a provider rate limit, a site that timed out,
 * a lead with no website at all, a provider that is not configured, pages that
 * simply had nothing quotable — and every one arrived as the same label, not
 * retryable. Eleven identical lines, no way to tell which were worth running
 * again and which needed a website adding.
 *
 * Worse, two of them were wrong rather than merely vague. A site that could
 * not be read is a fetch that failed, and it was settled as permanent, so the
 * lead never got a second attempt. And a provider rate limit was already being
 * retried by the worker while the shell told the owner it would not be.
 */

const receipt = (over: Record<string, unknown>) => ({
  attemptedAt: new Date().toISOString(),
  site: { configured: true, called: true, error: null, count: 1, statuses: [200], finalHosts: [] },
  parallel: { configured: true, called: true, error: null, count: 0 },
  context_dev: { configured: true, called: true, error: null, count: 0 },
  firecrawl: { configured: true, called: true, error: null, count: 0 },
  snapshotWrite: "written",
  ...over,
}) as never;

const NO_WEBSITE =
  "No company website on this lead, so there's nothing to research. Add a website or enrich the lead first.";

describe("a research failure says which kind it is", () => {
  it("a site that could not be read is worth another attempt", () => {
    const message = holdReason(receipt({
      site: { configured: true, called: true, error: "fetch failed", count: 0, statuses: [], finalHosts: [] },
    }));
    expect(classifyFailure(message)).toEqual({
      label: "couldn't reach their site, worth retrying",
      retryable: true,
    });
    // And the worker has to agree, or the label is a promise nothing keeps.
    expect(workerClassify(message)).toBe("transient");
  });

  it("a provider rate limit reads as retrying, which is what the worker does", () => {
    const message = holdReason(receipt({
      firecrawl: { configured: true, called: true, error: "rate limit exceeded", count: 0 },
    }));
    expect(classifyFailure(message).retryable).toBe(true);
    expect(workerClassify(message)).toBe("rate_limit");
  });

  it("a lead with no website says what would fix it", () => {
    // Not a failure of research: a gap in the record, and enrichment fills it.
    expect(classifyFailure(NO_WEBSITE)).toEqual({
      label: "lead has no website to research — enrich it first",
      retryable: false,
    });
    expect(workerClassify(NO_WEBSITE)).toBe("permanent");
  });

  it("an unconfigured provider is named rather than blamed on the lead", () => {
    const message = holdReason(receipt({
      firecrawl: { configured: false, called: false, error: "not_configured", count: 0 },
    }));
    expect(classifyFailure(message).label).toBe("a research provider is not configured");
    expect(classifyFailure(message).retryable).toBe(false);
  });

  it("keeps the original meaning when everything worked and nothing was quotable", () => {
    /*
     * The one case the old label was right about. Every provider answered, the
     * site read, pages were stored, and no sentence in them names the company
     * in a way that can be quoted as-is. Running it again returns the same
     * answer, so it must not become retryable while the others do.
     */
    const message = holdReason(receipt({}));
    expect(classifyFailure(message)).toEqual({
      label: "research found nothing usable to quote",
      retryable: false,
    });
    expect(workerClassify(message)).toBe("permanent");
  });

  it("does not collapse the five back into one", () => {
    const labels = new Set([
      classifyFailure(holdReason(receipt({ site: { configured: true, called: true, error: "x", count: 0, statuses: [], finalHosts: [] } }))).label,
      classifyFailure(holdReason(receipt({ firecrawl: { configured: true, called: true, error: "rate limit", count: 0 } }))).label,
      classifyFailure(holdReason(receipt({ firecrawl: { configured: false, called: false, error: "not_configured", count: 0 } }))).label,
      classifyFailure(holdReason(receipt({}))).label,
      classifyFailure(NO_WEBSITE).label,
    ]);
    expect(labels.size).toBe(5);
  });
});

/**
 * A lead with no website is not a dead end by design.
 *
 * research-lead refuses only when there is neither a website nor a company
 * name, and its own comment says why: "No website does not cancel outside
 * research. Parallel and Context can still search by company name." The
 * outside search runs with an empty websiteUrls list.
 *
 * So when a website-less lead comes back with nothing, the question is which
 * outside provider is switched off — and the answer has to be in the sentence,
 * because that sentence is all the owner sees.
 */
describe("the outside providers say which key is missing", () => {
  const off = (over: Record<string, unknown>) => holdReason(receipt({
    site: { configured: true, called: true, error: "no site", count: 0, statuses: [], finalHosts: [] },
    ...over,
  }));

  it("names Parallel's key, the way Firecrawl's was already named", () => {
    expect(off({ parallel: { configured: false, called: false, error: "not_configured", count: 0 } }))
      .toContain("Parallel is not configured (PARALLEL_API_KEY, LOVABLE_API_KEY)");
  });

  it("names all three of Context.dev's, because a half-configured one reads as absent", () => {
    const message = off({ context_dev: { configured: false, called: false, error: "not_configured", count: 0 } });
    expect(message).toContain("CONTEXT_DEV_GATEWAY_URL");
    expect(message).toContain("UDC_CONTEXT_DEV_API_KEY");
    expect(message).toContain("LOVABLE_API_KEY");
  });

  it("still reports a count when a provider ran, so 'off' and 'found nothing' stay different", () => {
    const ran = holdReason(receipt({
      parallel: { configured: true, called: true, error: null, count: 0 },
      context_dev: { configured: true, called: true, error: null, count: 3 },
    }));
    expect(ran).toContain("Parallel returned 0");
    expect(ran).toContain("Context.dev returned 3");
    expect(ran).not.toContain("PARALLEL_API_KEY");
  });
});
