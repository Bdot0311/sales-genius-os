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

/**
 * Names that identify nobody.
 *
 * The scheduled import writes "Unknown Contact" and "Unknown Company" when a
 * row arrives without them. Treating those as a name is how fifty real
 * prospects, each with their own address and none with a name, became one
 * lead: they all share the pair "unknown contact|unknown company", and each
 * accepted lead taught the filter to reject the next.
 *
 * A placeholder is the absence of a name wearing one.
 */
const PLACEHOLDERS = new Set(["unknown contact", "unknown company", "unknown", "n/a", "-"]);

/** Whether this pair says who someone is, rather than that nobody knows. */
export function identifying(lead: LeadLike): boolean {
  const name = norm(lead.contact_name);
  const company = norm(lead.company_name);
  if (!name || !company) return false;
  return !PLACEHOLDERS.has(name) && !PLACEHOLDERS.has(company);
}

/**
 * What an account already holds.
 *
 * Two pair sets, because the fallback is only a fallback. An address is an
 * identity: two leads with different addresses are two people, and matching
 * them on name and company anyway is what made distinct prospects vanish. So
 * the pair is consulted only when an address is missing on one side —
 * `fromEmailless` is what an arriving, addressed lead may match against, and
 * `all` is what an arriving lead with no address may match against.
 */
export type HeldIndex = {
  emails: Set<string>;
  all: Set<string>;
  fromEmailless: Set<string>;
};

export function indexHeld(rows: readonly LeadLike[]): HeldIndex {
  const emails = new Set<string>();
  const all = new Set<string>();
  const fromEmailless = new Set<string>();
  for (const row of rows) {
    const email = norm(row.contact_email);
    if (email) emails.add(email);
    if (identifying(row)) {
      const pair = namePair(row);
      all.add(pair);
      if (!email) fromEmailless.add(pair);
    }
  }
  return { emails, all, fromEmailless };
}

/** Whether this account already has this person. */
export function alreadyHeld(lead: LeadLike, held: HeldIndex): boolean {
  const email = norm(lead.contact_email);
  if (email) {
    if (held.emails.has(email)) return true;
    // A held row with no address, whose name and company say who it is.
    return identifying(lead) && held.fromEmailless.has(namePair(lead));
  }
  return identifying(lead) && held.all.has(namePair(lead));
}

/**
 * The incoming leads this account does not already have.
 *
 * Also drops repeats *within* the incoming batch: a search that returns the
 * same person twice would otherwise insert them twice on the first run, before
 * any of this is consulted. Each accepted lead is added to the index under the
 * same rules it was tested by, so an addressed lead contributes its address
 * and never a placeholder pair.
 */
export function dropAlreadyHeld<T extends LeadLike>(
  incoming: readonly T[],
  held: HeldIndex,
): T[] {
  const seen: HeldIndex = {
    emails: new Set(held.emails),
    all: new Set(held.all),
    fromEmailless: new Set(held.fromEmailless),
  };
  const out: T[] = [];
  for (const lead of incoming) {
    if (alreadyHeld(lead, seen)) continue;
    out.push(lead);
    const email = norm(lead.contact_email);
    if (email) seen.emails.add(email);
    if (identifying(lead)) {
      const pair = namePair(lead);
      seen.all.add(pair);
      if (!email) seen.fromEmailless.add(pair);
    }
  }
  return out;
}

/**
 * A PostgREST `or` filter that compares the way this module does.
 *
 * `in` is case-sensitive in Postgres, and these values are normalised before
 * they are compared — so looking up "jo@x.com" with `in` misses a stored
 * "Jo@X.com" and the lead is inserted again. The account-wide scan this
 * replaced did not have that problem, because it normalised in memory.
 *
 * Values are quoted, because a company name may contain the comma and
 * parenthesis this syntax is built from.
 */
export function orIlike(column: string, values: readonly string[]): string {
  const terms = values
    .filter((v) => v.trim())
    .map((v) => `${column}.ilike."${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return terms.join(",");
}

/** Values split into runs small enough for one request. */
export function chunk<T>(values: readonly T[], size = 50): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
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
