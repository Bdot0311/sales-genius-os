/**
 * Did the provider actually find this person, or did it hand back what we sent?
 *
 * "People search finds a lead but it's just the lead I already have, with no
 * email." The lookup was calling the provider correctly. What it did with an
 * empty answer was the problem.
 *
 * The result is assembled with the caller's own input as the last fallback:
 *
 *   resolvedName    = ...provider fields... || fullName
 *   resolvedCompany = ...provider fields... || company
 *
 * and a match was then declared whenever a name or an email was present. For a
 * name-plus-company lookup that condition is satisfied before the provider is
 * even called, because the name is the one the user typed. So an empty upstream
 * answer produced a "found" contact whose only two fields were the two the user
 * had entered, charged a credit for it, wrote it into leads, and showed it under
 * a green "Saved to leads" badge. Repeating the lookup on someone already saved
 * then matched that row and updated it with nothing — which is exactly what
 * "it keeps showing the lead in my saved leads" looks like from the outside.
 *
 * A field only counts as evidence when the provider is where it came from.
 */

/** Fields only a provider can supply — the user is never asked for any of them. */
export const PROVIDER_ONLY_FIELDS = [
  "contact_phone",
  "job_title",
  "seniority",
  "company_website",
  "company_linkedin",
  "industry",
  "employee_count",
  "company_description",
] as const;

/** Fields the user may have typed, so they count only when they differ. */
export const ECHOABLE_FIELDS = ["contact_name", "contact_email", "linkedin_url", "company_name"] as const;

export interface LookupInput {
  fullName?: string | null;
  company?: string | null;
  email?: string | null;
  linkedin?: string | null;
}

const norm = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Loose equality for "is this the same string the user typed". */
function echoes(value: unknown, typed: unknown): boolean {
  const a = norm(value);
  const b = norm(typed);
  if (!a || !b) return false;
  if (a === b) return true;
  // linkedin.com/in/x, www.linkedin.com/in/x and https://…/in/x/ are one answer.
  const strip = (s: string) => s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  return strip(a) === strip(b);
}

/**
 * The fields the provider contributed: anything it can uniquely know, plus the
 * ones the user could have typed only when the answer is not the typed value.
 */
export function providerContributions(
  person: Record<string, unknown>,
  input: LookupInput,
): string[] {
  const found: string[] = [];

  for (const field of PROVIDER_ONLY_FIELDS) {
    if (person[field]) found.push(field);
  }

  const typedFor: Record<string, unknown> = {
    contact_name: input.fullName,
    contact_email: input.email,
    linkedin_url: input.linkedin,
    company_name: input.company,
  };
  for (const field of ECHOABLE_FIELDS) {
    const value = person[field];
    if (value && !echoes(value, typedFor[field])) found.push(field);
  }

  return found;
}

/**
 * Whether the lookup found a person.
 *
 * Not "is there a name" — the name can be the caller's own. At least one field
 * has to have come from upstream.
 */
export function isRealMatch(person: Record<string, unknown>, input: LookupInput): boolean {
  return providerContributions(person, input).length > 0;
}

export interface FieldChange {
  field: string;
  from: string | null;
  to: string;
}

/**
 * What this lookup would change on a lead that already exists.
 *
 * The save used to be automatic and silent: every lookup wrote straight into
 * leads, so a lookup that learned nothing still reported "Saved to leads" and
 * a lookup that learned a great deal reported the same thing. Nothing said
 * which fields were new, and there was no way to look without writing.
 *
 * Only additions and changes are listed. A field the lookup returns empty never
 * overwrites one the lead already has — an upstream gap is not a correction.
 */
export function diffAgainstLead(
  person: Record<string, unknown>,
  lead: Record<string, unknown> | null,
): FieldChange[] {
  if (!lead) return [];
  const changes: FieldChange[] = [];
  for (const [field, value] of Object.entries(person)) {
    if (value === null || value === undefined || value === "") continue;
    if (field === "id") continue;
    const current = lead[field];
    if (current !== null && current !== undefined && current !== "" && norm(current) === norm(value)) continue;
    changes.push({
      field,
      from: current === null || current === undefined || current === "" ? null : String(current),
      to: String(value),
    });
  }
  return changes;
}

/** The fields a save is allowed to write. Anything else in the body is ignored. */
export const SAVABLE_FIELDS = [
  "contact_name",
  "contact_email",
  "contact_phone",
  "job_title",
  "seniority",
  "linkedin_url",
  "company_name",
  "company_website",
  "company_linkedin",
  "industry",
  "employee_count",
  "company_description",
  "country",
] as const;

/**
 * The record to write, from a person payload.
 *
 * Empty values are dropped rather than written: a provider that does not know
 * someone's phone number has not told us the number is blank, and blanking a
 * field the user already had would make the lookup destructive.
 */
export function savableRecord(person: Record<string, unknown>): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of SAVABLE_FIELDS) {
    const value = person[field];
    if (value === null || value === undefined || value === "") continue;
    record[field] = typeof value === "string" ? value.slice(0, 2000) : value;
  }
  return record;
}

/** Human label for a field, for the "what would change" list. */
export function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    contact_name: "Name",
    contact_email: "Email",
    contact_phone: "Phone",
    job_title: "Title",
    seniority: "Seniority",
    linkedin_url: "LinkedIn",
    company_name: "Company",
    company_website: "Website",
    company_linkedin: "Company LinkedIn",
    industry: "Industry",
    employee_count: "Employees",
    company_description: "Company description",
    country: "Country",
  };
  return labels[field] ?? field.replace(/_/g, " ");
}
