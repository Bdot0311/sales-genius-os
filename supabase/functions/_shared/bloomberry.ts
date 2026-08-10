// Parsing helpers for Bloomberry technographic responses.
//
// Kept separate from the edge functions so the schema handling is pure and
// unit-testable. It was written against field-name aliases because
// docs.bloomberry.com is unreachable from our network; /enrichments/tech.json
// has since been confirmed against a real response and its names now lead each
// alias list. /signals/tech.json is still unconfirmed, so the tolerance stays.
//
// Confirmed enrichment shape:
//   { "vendors": [{ "vendor_name": "360Learning",
//                   "vendor_category": "learning management",
//                   "vendor_upper_level_category": "HR & People Operations",
//                   "vendor_url": "360learning.com",
//                   "usage_started_at": 1760500800 }] }
//
// Two things that shape depends on and are easy to get wrong: usage_started_at
// is an epoch in SECONDS (see pickDate), and it is frequently null — Bloomberry
// knows the vendor is in use without knowing when it started. A record with no
// date is still a valid part of the stack; it simply cannot produce a signal.

export const norm = (s: unknown): string => (typeof s === "string" ? s.toLowerCase().trim() : "");

/** Bare registrable domain from a stored website value. */
export function toDomain(website?: string | null): string | null {
  if (!website) return null;
  const host = website.trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split("?")[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}

/** jsonb columns come back as arrays, JSON strings, or null. */
export function toStringArray(v: unknown): string[] {
  let raw: unknown = v;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return raw ? [raw as string] : []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x : (x as Record<string, unknown>)?.name))
    .filter((s): s is string => typeof s === "string" && !!s.trim());
}

// The names confirmed against a real /enrichments/tech.json response lead each
// list; the rest stay as fallbacks in case sibling endpoints differ.
// Confirmed envelope: { vendors: [{ vendor_name, vendor_category,
// vendor_upper_level_category, vendor_url, usage_started_at }] }.
const LIST_KEYS = ["vendors", "results", "data", "technologies", "tech", "technographics", "products", "items", "records"];
const NESTED_KEYS = ["company", "result", "enrichment", "response"];
const NAME_KEYS = ["vendor_name", "product", "product_name", "vendor", "name", "technology", "tech_name", "title"];
// vendor_category is the specific label ("learning management"); the upper
// level ("HR & People Operations") is the fallback when the specific one is
// absent, since a broad label still beats no category at all.
const CATEGORY_KEYS = ["vendor_category", "category", "category_name", "product_category", "categories", "vendor_upper_level_category"];
const START_KEYS = ["usage_started_at", "start_date", "started_at", "first_seen", "first_seen_date", "adopted_at", "adoption_date", "since", "date_added", "added_at"];
// No end field appeared in the confirmed enrichment payload — that endpoint
// looks like a current-stack view. These stay so a churn field is picked up
// automatically if one exists on other records or on /signals/tech.json.
const END_KEYS = ["usage_ended_at", "usage_stopped_at", "end_date", "ended_at", "last_seen", "last_seen_date", "churned_at", "churn_date", "removed_at", "date_removed"];

/** Find the array of tech records regardless of the envelope wrapping it. */
export function extractList(payload: unknown, depth = 0): Record<string, unknown>[] {
  const isRecord = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object";
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload) || depth > 2) return [];
  for (const k of LIST_KEYS) {
    if (Array.isArray(payload[k])) return (payload[k] as unknown[]).filter(isRecord);
  }
  for (const k of NESTED_KEYS) {
    const inner = extractList(payload[k], depth + 1);
    if (inner.length) return inner;
  }
  return [];
}

export function pickString(item: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === "string" && (v[0] as string).trim()) return (v[0] as string).trim();
    if (v && typeof v === "object" && typeof (v as Record<string, unknown>).name === "string") {
      const n = (v as Record<string, unknown>).name as string;
      if (n.trim()) return n.trim();
    }
  }
  return null;
}

// Anything at or above this is an epoch rather than a bare year: 1e8 seconds is
// 1973, and a four-digit year never reaches it. Below 1e11 the epoch is in
// seconds (1e11 seconds is the year 5138, 1e11 milliseconds is 1973), which is
// what Bloomberry sends — usage_started_at: 1760500800.
const EPOCH_FLOOR = 1e8;
const EPOCH_MS_FLOOR = 1e11;
// Reject epochs before 1990: a stray small number would otherwise decode to a
// 1970s date and read as a real, very old adoption.
const MIN_PLAUSIBLE_MS = Date.parse("1990-01-01T00:00:00Z");

/**
 * Parse to ISO, rejecting unparseable values and anything in the future.
 *
 * Handles both ISO-ish strings and numeric epochs, in seconds or milliseconds.
 * Date.parse cannot read an epoch — Date.parse("1760500800") does not mean
 * 2025 — so a numeric value is converted explicitly rather than stringified.
 */
export function pickDate(item: Record<string, unknown>, keys: string[], nowMs = Date.now()): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v !== "string" && typeof v !== "number") continue;

    const numeric = typeof v === "number" ? v : /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
    if (Number.isFinite(numeric) && numeric >= EPOCH_FLOOR) {
      const ms = numeric < EPOCH_MS_FLOOR ? numeric * 1000 : numeric;
      if (ms > nowMs + 86_400_000 || ms < MIN_PLAUSIBLE_MS) continue;
      return new Date(ms).toISOString();
    }

    const t = Date.parse(String(v));
    if (Number.isNaN(t) || t > nowMs + 86_400_000) continue;
    return new Date(t).toISOString();
  }
  return null;
}

export interface TechItem {
  name: string;
  category: string | null;
  /** When the company started running it, if reported. */
  start: string | null;
  /** When they stopped. Null means still in use. */
  end: string | null;
}

/** Normalize a Bloomberry payload into deduped tech records. */
export function normalizeTech(payload: unknown, nowMs = Date.now()): TechItem[] {
  const out: TechItem[] = [];
  const seen = new Set<string>();
  for (const item of extractList(payload)) {
    const name = pickString(item, NAME_KEYS);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      category: pickString(item, CATEGORY_KEYS),
      start: pickDate(item, START_KEYS, nowMs),
      end: pickDate(item, END_KEYS, nowMs),
    });
  }
  return out;
}

export interface TechChange {
  item: TechItem;
  change: "added" | "removed";
  at: string;
}

/** Stack changes inside the lookback window, strongest-and-most-recent first. */
export function recentChanges(
  tech: TechItem[],
  lookbackDays: number,
  isCompetitor: (name: string) => boolean,
  nowMs = Date.now(),
): TechChange[] {
  const cutoff = nowMs - lookbackDays * 86_400_000;
  const changes: TechChange[] = [];
  for (const t of tech) {
    // A removal supersedes the adoption that preceded it.
    if (t.end && Date.parse(t.end) >= cutoff) changes.push({ item: t, change: "removed", at: t.end });
    else if (!t.end && t.start && Date.parse(t.start) >= cutoff) changes.push({ item: t, change: "added", at: t.start });
  }
  return changes.sort((a, b) => {
    const ca = isCompetitor(a.item.name) ? 1 : 0;
    const cb = isCompetitor(b.item.name) ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return Date.parse(b.at) - Date.parse(a.at);
  });
}

/** Loose competitor match so "HubSpot" matches "HubSpot CRM" and vice versa. */
export function competitorMatcher(competitors: string[]): (name: string) => boolean {
  const list = competitors.map(norm).filter(Boolean);
  return (name: string) => {
    const n = norm(name);
    if (!n) return false;
    return list.some((c) => n === c || n.includes(c) || c.includes(n));
  };
}

// ---------------------------------------------------------------------------
// /signals/tech.json — the inverse query
//
// The enrichment endpoint answers "what does this company run?" (domain in,
// stack out). The signals endpoint answers "who just started or stopped
// running this?" (vendor or category in, companies out), newest first. That is
// account discovery rather than lead enrichment, so it gets its own record
// shape: the subject is a company, and the product is the thing it moved on.
//
// Same alias-driven approach and the same reason — see the note above.
// ---------------------------------------------------------------------------

const COMPANY_KEYS = ["company", "company_name", "organization", "organization_name", "org", "employer", "name"];
// company_url leads on the assumption this endpoint mirrors the enrichment
// endpoint's vendor_url naming. Plain "url" stays last: on a record carrying
// both the company and the vendor, a bare url is as likely to be the vendor's.
const DOMAIN_KEYS = ["company_url", "domain", "company_domain", "website", "web_site", "site", "homepage", "url"];
const CHANGE_KEYS = ["change", "change_type", "event", "event_type", "type", "action", "direction", "status", "signal"];
const CHANGE_DATE_KEYS = ["date", "changed_at", "change_date", "event_date", "observed_at", "detected_at", "occurred_at", ...START_KEYS];

const ADDED_WORDS = ["add", "added", "adopt", "adopted", "adoption", "new", "start", "started", "gain", "gained", "won", "install", "installed", "subscribe", "subscribed"];
const REMOVED_WORDS = ["remove", "removed", "churn", "churned", "drop", "dropped", "lost", "loss", "stop", "stopped", "uninstall", "uninstalled", "cancel", "cancelled", "canceled", "end", "ended"];

// On this endpoint the company owns the "name" field, so the product has to be
// read from product-specific aliases only — otherwise every record would report
// the company as its own product.
const PRODUCT_KEYS_FOR_SIGNALS = NAME_KEYS.filter((k) => k !== "name" && k !== "title");

/**
 * Read the add/remove direction from whichever field carries it, falling back
 * to date shape: an end date means they left, otherwise they arrived.
 */
export function pickChange(item: Record<string, unknown>, nowMs = Date.now()): "added" | "removed" | null {
  for (const k of CHANGE_KEYS) {
    const v = item[k];
    if (typeof v === "boolean") return v ? "added" : "removed";
    if (typeof v !== "string") continue;
    const n = norm(v);
    if (!n) continue;
    // Removal is checked first so a value like "churn_added_date" cannot read
    // as an adoption on the strength of the word it happens to end with.
    if (REMOVED_WORDS.some((w) => n === w || n.includes(w))) return "removed";
    if (ADDED_WORDS.some((w) => n === w || n.includes(w))) return "added";
  }
  if (pickDate(item, END_KEYS, nowMs)) return "removed";
  if (pickDate(item, START_KEYS, nowMs)) return "added";
  return null;
}

export interface CompanySignal {
  company: string;
  domain: string | null;
  product: string | null;
  category: string | null;
  change: "added" | "removed";
  at: string | null;
}

/**
 * Normalize a /signals/tech.json payload into company-level change records,
 * deduped per company+product+direction and sorted newest first.
 *
 * Records whose direction cannot be established are dropped rather than
 * guessed: reporting a churn as an adoption would invert the sales motion the
 * whole feature exists to drive.
 */
export function normalizeCompanySignals(payload: unknown, nowMs = Date.now()): CompanySignal[] {
  const out: CompanySignal[] = [];
  const seen = new Set<string>();
  for (const item of extractList(payload)) {
    const company = pickString(item, COMPANY_KEYS);
    const domain = toDomain(pickString(item, DOMAIN_KEYS));
    if (!company && !domain) continue;
    const change = pickChange(item, nowMs);
    if (!change) continue;

    const product = pickString(item, PRODUCT_KEYS_FOR_SIGNALS);
    const key = `${norm(company ?? domain)}|${norm(product)}|${change}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      company: company ?? domain!,
      domain,
      product,
      category: pickString(item, CATEGORY_KEYS),
      change,
      // A churn is dated by when they left; an adoption by when they arrived.
      at: change === "removed"
        ? pickDate(item, [...END_KEYS, ...CHANGE_DATE_KEYS], nowMs)
        : pickDate(item, CHANGE_DATE_KEYS, nowMs),
    });
  }
  return out.sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0));
}

