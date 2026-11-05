import { describe, expect, it } from "vitest";
import {
  countEmailGaps,
  enrichedWithoutEmail,
  hasNoEmail,
  isEnriched,
  unenrichedWithoutEmail,
} from "./lead-email-gap";

/**
 * Reported as "says 3 leads with no emails but all my leads are enriched".
 *
 * The count was right and the sentence was wrong. Enrichment can succeed and
 * still find no address — enrich-lead treats 'enriched' and 'has an email' as
 * separate facts, and the overview collapsed them into one. The reader was
 * told to go and do work they had already done.
 */

describe("isEnriched matches what enrich-lead means by it", () => {
  it("counts a status of enriched", () => {
    expect(isEnriched({ enrichment_status: "enriched" })).toBe(true);
  });

  it("counts any enrichment timestamp, whatever the status says", () => {
    expect(isEnriched({ enriched_at: "2026-11-01T00:00:00Z" })).toBe(true);
    expect(isEnriched({ enrichment_status: "failed", enriched_at: "2026-11-01T00:00:00Z" })).toBe(true);
  });

  it("does not count a lead that was never run", () => {
    expect(isEnriched({})).toBe(false);
    expect(isEnriched({ enrichment_status: "pending" })).toBe(false);
    expect(isEnriched({ enrichment_status: null, enriched_at: null })).toBe(false);
  });
});

describe("hasNoEmail", () => {
  it("treats an empty or whitespace address as none, since neither can be sent to", () => {
    expect(hasNoEmail({ contact_email: "" })).toBe(true);
    expect(hasNoEmail({ contact_email: "   " })).toBe(true);
    expect(hasNoEmail({ contact_email: null })).toBe(true);
    expect(hasNoEmail({})).toBe(true);
  });

  it("accepts a real address", () => {
    expect(hasNoEmail({ contact_email: "dana@acme.com" })).toBe(false);
  });
});

describe("the two kinds of missing address are kept apart", () => {
  const enrichedNoEmail = { contact_email: null, enrichment_status: "enriched" };
  const neverRun = { contact_email: null };
  const reachable = { contact_email: "dana@acme.com", enrichment_status: "enriched" };

  it("separates an enriched lead with no address from one never run", () => {
    expect(enrichedWithoutEmail(enrichedNoEmail)).toBe(true);
    expect(unenrichedWithoutEmail(enrichedNoEmail)).toBe(false);

    expect(unenrichedWithoutEmail(neverRun)).toBe(true);
    expect(enrichedWithoutEmail(neverRun)).toBe(false);
  });

  it("counts neither for a lead that has an address", () => {
    expect(enrichedWithoutEmail(reachable)).toBe(false);
    expect(unenrichedWithoutEmail(reachable)).toBe(false);
  });

  /*
   * The reported case: every lead enriched, three with no address found. The
   * old copy said "3 leads have no email address" and told the reader to fill
   * them in. The total is unchanged — only the explanation differs.
   */
  it("reproduces the report: all enriched, three with no address", () => {
    const leads = [
      ...Array.from({ length: 174 }, () => reachable),
      enrichedNoEmail,
      enrichedNoEmail,
      enrichedNoEmail,
    ];
    expect(countEmailGaps(leads)).toEqual({ total: 3, enriched: 3, unenriched: 0 });
  });

  it("splits a mixed list", () => {
    expect(countEmailGaps([enrichedNoEmail, neverRun, neverRun, reachable]))
      .toEqual({ total: 3, enriched: 1, unenriched: 2 });
  });

  it("counts nothing when every lead is reachable", () => {
    expect(countEmailGaps([reachable, reachable])).toEqual({ total: 0, enriched: 0, unenriched: 0 });
  });
});
