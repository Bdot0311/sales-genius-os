// Parsing helpers for Bloomberry technographic responses.
//
// Kept separate from detect-tech-signals/index.ts so the schema handling is
// pure and unit-testable: docs.bloomberry.com is unreachable from our network,
// so the exact field names on /enrichments/tech.json could not be confirmed
// against the reference. Rather than commit to one guess, each field is read
// through an alias list covering the naming conventions the payload plausibly
// uses, and unknown shapes degrade to "no data" instead of throwing.
//
// If Bloomberry's exact field names are confirmed later, the alias arrays below
// are the only thing that needs to change — and adding the real name to the
// front of a list is a safe, backwards-compatible edit.

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

const LIST_KEYS = ["results", "data", "technologies", "tech", "technographics", "products", "vendors", "items", "records"];
const NESTED_KEYS = ["company", "result", "enrichment", "response"];
const NAME_KEYS = ["product", "product_name", "vendor", "vendor_name", "name", "technology", "tech_name", "title"];
const CATEGORY_KEYS = ["category", "category_name", "product_category", "categories"];
const START_KEYS = ["start_date", "started_at", "first_seen", "first_seen_date", "adopted_at", "adoption_date", "since", "date_added", "added_at"];
const END_KEYS = ["end_date", "ended_at", "last_seen", "last_seen_date", "churned_at", "churn_date", "removed_at", "date_removed"];

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

/** Parse to ISO, rejecting unparseable values and anything in the future. */
export function pickDate(item: Record<string, unknown>, keys: string[], nowMs = Date.now()): string | null {
  for (const k of keys) {
    const v = item[k];
    if (typeof v !== "string" && typeof v !== "number") continue;
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
