/**
 * Saving a search result into the workspace.
 *
 * Two things went wrong here in the field. A lead with no website failed to
 * save at all — "duplicate key value violates unique constraint
 * companies_domain_key" — because a missing domain was written as an empty
 * string, and the second blank-domain company collided with the first. And a
 * lead with no email saved anyway, silently, under a button labelled
 * "Enrich & Save" that never enriched anything.
 *
 * The pure decisions live here so they can be tested without a database.
 */

/**
 * A domain the database can store. Blank becomes null, not "".
 *
 * companies.domain is uniquely indexed per workspace. NULL is exempt from a
 * unique index; an empty string is not, so every domain-less company after the
 * first one collided.
 */
export function normalizeCompanyDomain(raw?: string | null): string | null {
  const trimmed = (raw ?? "").trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim() || null;
}

/** An address the database can store, or null when the search found none. */
export function normalizeLeadEmail(raw?: string | null): string | null {
  const trimmed = (raw ?? "").trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

/** Postgres unique-violation, however the client wraps it. */
export function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  if (e.code === "23505") return true;
  return /duplicate key value violates unique constraint/i.test(e.message ?? "");
}

export function splitContactName(full?: string | null): { firstName: string; lastName: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/**
 * Which fields the save actually carried. The history row used to claim every
 * field on the list regardless of whether the value was there, which made an
 * empty lead look enriched in its own audit trail.
 */
export function enrichedFieldsPresent(values: Record<string, unknown>): string[] {
  return Object.entries(values)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k]) => k);
}

export interface SaveOutcome {
  /** The lead had an address before the save. */
  hadEmail: boolean;
  /** Enrichment ran because it didn't, and returned one. */
  foundEmail: string | null;
  /** Enrichment ran and failed, or could not run. */
  enrichmentFailed: boolean;
  contactName: string;
  companyName: string;
}

/** What to tell the user, matching what actually happened. */
export function saveToast(outcome: SaveOutcome): {
  title: string;
  description: string;
  variant?: "destructive";
} {
  const who = `${outcome.contactName} at ${outcome.companyName}`;
  if (outcome.hadEmail) {
    return { title: "Lead saved", description: `${who} is in your saved leads.` };
  }
  if (outcome.foundEmail) {
    return {
      title: "Lead enriched & saved",
      description: `Found ${outcome.foundEmail} for ${who}.`,
    };
  }
  return {
    title: "Saved without an email",
    description: `${who} is in your saved leads, but no verified address could be found${
      outcome.enrichmentFailed ? " — enrichment could not run" : ""
    }. Add one manually, or try again from Saved Leads once there's a LinkedIn profile to work from.`,
  };
}
