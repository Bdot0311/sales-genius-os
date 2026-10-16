/**
 * When two lead rows are the same person.
 *
 * ── Why this is its own file ────────────────────────────────────────────
 *
 * It was a filter written inline inside a scheduled import, and the test for
 * it could only read the source: it asserted that `seenEmails.has(email)` was
 * called, which a filter that calls it and returns `true` anyway satisfies
 * perfectly while inserting every lead. A rule that decides whether a prospect
 * gets emailed twice should be runnable by a test, not described to one.
 *
 * ── The rule ────────────────────────────────────────────────────────────
 *
 * The same contact_email, compared with case and surrounding space ignored,
 * because "Jo@X.com " and "jo@x.com" are one person and two sequences to them
 * is the harm this prevents.
 *
 * Failing that — the address is missing on one side, which happens constantly
 * on imported data — the same contact_name and company_name. A weaker key, so
 * it is only ever a fallback, never a substitute for an address that exists.
 *
 * Lifted from `dropSeenLeads` in fetch-external-leads, which had the same
 * rule. Two definitions of "the same lead" in one product is how one of them
 * quietly stops matching.
 */

/** A lead, from either side of the comparison. Only these fields matter. */
export type LeadLike = {
  contact_email?: string | null;
  contact_name?: string | null;
  company_name?: string | null;
};

/** Case and surrounding space never distinguish two people. */
export const norm = (v: unknown): string => String(v ?? "").trim().toLowerCase();

/** The weaker key, for rows with no usable address. */
export const namePair = (lead: LeadLike): string =>
  `${norm(lead.contact_name)}|${norm(lead.company_name)}`;

/** What an account already holds, in the shape the filter needs. */
export type HeldIndex = { emails: Set<string>; pairs: Set<string> };

export function indexHeld(rows: readonly LeadLike[]): HeldIndex {
  const emails = new Set<string>();
  const pairs = new Set<string>();
  for (const row of rows) {
    const email = norm(row.contact_email);
    if (email) emails.add(email);
    const pair = namePair(row);
    // "|" alone means neither field was set, which matches everything empty
    // and would drop every nameless lead as a duplicate of every other.
    if (pair !== "|") pairs.add(pair);
  }
  return { emails, pairs };
}

/** Whether this account already has this person. */
export function alreadyHeld(lead: LeadLike, held: HeldIndex): boolean {
  const email = norm(lead.contact_email);
  if (email) return held.emails.has(email) || held.pairs.has(namePair(lead));
  return held.pairs.has(namePair(lead));
}

/**
 * The incoming leads this account does not already have.
 *
 * Also drops repeats *within* the incoming batch: a search that returns the
 * same person twice would otherwise insert them twice on the first run, before
 * any of this is consulted.
 */
export function dropAlreadyHeld<T extends LeadLike>(
  incoming: readonly T[],
  held: HeldIndex,
): T[] {
  const seen: HeldIndex = { emails: new Set(held.emails), pairs: new Set(held.pairs) };
  const out: T[] = [];
  for (const lead of incoming) {
    if (alreadyHeld(lead, seen)) continue;
    out.push(lead);
    const email = norm(lead.contact_email);
    if (email) seen.emails.add(email);
    const pair = namePair(lead);
    if (pair !== "|") seen.pairs.add(pair);
  }
  return out;
}

/** The addresses worth looking up, so the query is sized by the import. */
export function emailsToCheck(incoming: readonly LeadLike[]): string[] {
  return [...new Set(incoming.map((l) => norm(l.contact_email)).filter(Boolean))];
}

/** The companies worth looking up, for the fallback key. */
export function companiesToCheck(incoming: readonly LeadLike[]): string[] {
  return [...new Set(incoming.map((l) => String(l.company_name ?? "").trim()).filter(Boolean))];
}
