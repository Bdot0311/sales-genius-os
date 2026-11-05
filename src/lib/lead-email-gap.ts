/*
 * Why a lead has no email address, which is not one question but two.
 *
 * The overview counted "leads with no email address" and told the reader to
 * go and fill them in. For a lead that was never enriched that is the right
 * instruction. For one that WAS enriched and came back without an address it
 * is wrong, and it reads as the product not having noticed the work already
 * done — which is exactly how it was reported.
 *
 * enrich-lead already draws this line. It sets enrichment_status to
 * 'enriched' and then, separately, checks `!!lead.contact_email`, because a
 * successful enrichment that finds a company and a title but no address is an
 * ordinary outcome rather than a failure. The UI counted the two together.
 *
 * `enriched` matches that function's own test exactly, so the page and the
 * backend cannot disagree about what the word means.
 */

export interface LeadEmailGapRow {
  contact_email?: string | null;
  enrichment_status?: string | null;
  enriched_at?: string | null;
}

/** The test enrich-lead uses: a status of 'enriched', or any enrichment timestamp. */
export function isEnriched(lead: LeadEmailGapRow): boolean {
  return lead.enrichment_status === "enriched" || Boolean(lead.enriched_at);
}

/** No address at all. Empty string counts, since it cannot be sent to either. */
export function hasNoEmail(lead: LeadEmailGapRow): boolean {
  return !lead.contact_email?.trim();
}

/** Enriched, and the enrichment did not turn up an address. Nothing left to try here. */
export function enrichedWithoutEmail(lead: LeadEmailGapRow): boolean {
  return hasNoEmail(lead) && isEnriched(lead);
}

/** No address and never enriched. This one is actionable. */
export function unenrichedWithoutEmail(lead: LeadEmailGapRow): boolean {
  return hasNoEmail(lead) && !isEnriched(lead);
}

export interface EmailGapCounts {
  /** Both kinds together, for the headline note on the leads tile. */
  total: number;
  enriched: number;
  unenriched: number;
}

export function countEmailGaps(leads: LeadEmailGapRow[]): EmailGapCounts {
  let enriched = 0;
  let unenriched = 0;
  for (const lead of leads) {
    if (!hasNoEmail(lead)) continue;
    if (isEnriched(lead)) enriched++;
    else unenriched++;
  }
  return { total: enriched + unenriched, enriched, unenriched };
}
