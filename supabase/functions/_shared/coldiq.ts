// @ts-nocheck
// ColdIQ — one API key in front of 40+ GTM data providers.
//
// SCOPE. Two uses, at two different layers:
//
//   * Email verification (_shared/email-verify.ts).
//   * Lead sourcing as a LAST RESORT, when the primary provider returned
//     nothing for a search that the user has already spent a credit on.
//
// The second is deliberately a fallback at the orchestration layer, not a peer
// of the vendors inside the `salesos` service that RAILWAY_LEADS_API_URL points
// at. Making ColdIQ a peer there — so it competes inside that service's own
// waterfall — is a different change and belongs in that repo. What this does is
// narrower and cheaper: it answers "the search came back empty" rather than
// "which vendor should have answered this".
//
// Verification covers every provider regardless of where leads come from:
// fetch-external-leads verifies the merged result set after sourcing, so both
// paths pass through the same gate.
//
// Confirmed against the ColdIQ OpenAPI spec (ColdIQ API 0.1.0): the server is
// https://api.coldiq.com, auth is HTTP bearer, and the verb lives at
// POST /v1/email/verify. The overrides below remain because a marketplace
// versions its own paths and this costs nothing to keep:
//
//   COLDIQ_API_KEY      required — the marketplace key. Absent = ColdIQ off.
//   COLDIQ_BASE_URL     default https://api.coldiq.com
//   COLDIQ_VERIFY_PATH  default /v1/email/verify
//   COLDIQ_AUTH_STYLE   "bearer" (default) | "x-api-key" | "both"
//   COLDIQ_MAX_CREDITS  optional per-record spend cap, in credits
//   COLDIQ_SEARCH_PATH  default /v1/people/search
//   COLDIQ_LEADS        "fallback" (default) | "off" — lead sourcing only
//
// Billing, per the spec: verification runs on BounceBan at ~0.2 credits per
// conclusively-verified address, failing over to Icypeas at 0.1. An `unknown`
// verdict is free. So the free DNS gate in email-verify.ts is not just a
// latency win — every address it disqualifies is one ColdIQ never bills for.

const DEFAULT_BASE_URL = "https://api.coldiq.com";
const DEFAULT_VERIFY_PATH = "/v1/email/verify";
const DEFAULT_SEARCH_PATH = "/v1/people/search";
const SEARCH_TIMEOUT_MS = 20_000;

export function coldiqApiKey(): string | null {
  return Deno.env.get("COLDIQ_API_KEY") || null;
}

export function coldiqConfigured(): boolean {
  return coldiqApiKey() !== null;
}

export function coldiqBaseUrl(): string {
  return (Deno.env.get("COLDIQ_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Auth header(s).
 *
 * Marketplaces differ on Bearer vs a custom key header, and "both" sends each.
 * That is harmless where one is ignored and removes a whole category of
 * first-run 401 that reads like a bad key rather than a wrong header name.
 */
export function coldiqAuthHeaders(): Record<string, string> {
  const key = coldiqApiKey();
  if (!key) return {};
  const style = (Deno.env.get("COLDIQ_AUTH_STYLE") || "bearer").toLowerCase();
  if (style === "x-api-key") return { "X-API-Key": key };
  if (style === "both") return { Authorization: `Bearer ${key}`, "X-API-Key": key };
  return { Authorization: `Bearer ${key}` };
}

/**
 * Optional per-record spend cap, as the API's own `max_credits` field.
 *
 * The marketplace routes across vendors of different prices, so one expensive
 * provider answering can cost several times what the usual one does. This caps
 * that per address: a provider that would answer but costs more is skipped,
 * and the record comes back a miss rather than an unbounded charge. Unset by
 * default — capping too low silently converts verifications into misses.
 */
export function coldiqSpendCap(): { max_credits?: number } {
  const raw = Number(Deno.env.get("COLDIQ_MAX_CREDITS"));
  return Number.isFinite(raw) && raw > 0 ? { max_credits: raw } : {};
}

export function coldiqVerifyUrl(): string {
  const path = Deno.env.get("COLDIQ_VERIFY_PATH") || DEFAULT_VERIFY_PATH;
  return `${coldiqBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Whether ColdIQ may be used to source leads.
 *
 * `fallback` (the default) only calls it when the primary provider returned
 * nothing — a search that already worked never spends a marketplace credit,
 * and the only searches that do are ones whose alternative is showing the user
 * an empty page they already paid a credit for. `off` disables it entirely.
 *
 * There is deliberately no "always" mode. Running both providers on every
 * search would roughly double per-search cost to duplicate results the primary
 * already returned, and the dedupe would throw most of it away.
 */
export function coldiqLeadsMode(): "off" | "fallback" {
  return (Deno.env.get("COLDIQ_LEADS") || "fallback").toLowerCase() === "off" ? "off" : "fallback";
}

/** Filters as this codebase already models them. Every field is optional —
 *  the verb takes any combination. */
export interface ColdIqPeopleSearch {
  job_titles?: string[];
  seniorities?: string[];
  locations?: string[];
  keywords?: string[];
  company_domains?: string[];
  company_linkedin_urls?: string[];
  limit?: number;
  max_per_company?: number;
}

/** Drop empty arrays and undefined so an unread field never becomes a filter
 *  that matches nothing. Empty keys are what turned into broken upstream
 *  queries on the existing provider. */
function compact(input: ColdIqPeopleSearch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const cleaned = v.map((x) => String(x).trim()).filter(Boolean);
      if (cleaned.length) out[k] = cleaned;
      continue;
    }
    out[k] = v;
  }
  return out;
}

/**
 * Log the shape of a payload — keys only, never values.
 *
 * The GTM verbs return a normalized record whose fields the OpenAPI spec leaves
 * untyped, so the only way to pin them is to look at one live answer. Same
 * trick that pinned the Bloomberry and PredictLeads schemas. Keys only: these
 * payloads carry real people's contact details.
 */
export function logShape(label: string, payload: unknown): void {
  const keysOf = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.length ? [keysOf(v[0])] : [];
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = val && typeof val === "object" ? keysOf(val) : typeof val;
      }
      return out;
    }
    return typeof v;
  };
  console.log(`[coldiq] ${label} shape (keys only):`, JSON.stringify(keysOf(payload)).slice(0, 800));
}

/**
 * Pull the record array out of whatever envelope the response used.
 *
 * The spec types the GTM response as `{data, _meta, results}` with all three
 * untyped, so this reads the shapes those verbs actually use and falls back to
 * the names these APIs habitually pick. An unrecognised envelope yields no
 * records rather than a guess.
 */
export function extractRecords(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (!payload || typeof payload !== "object") return [];

  const obj = payload as Record<string, unknown>;
  const CANDIDATES = [
    "data", "results", "people", "leads", "contacts", "persons",
    "records", "items", "rows", "profiles", "matches",
  ];

  for (const key of CANDIDATES) {
    const value = obj[key];
    if (Array.isArray(value)) return value as Record<string, unknown>[];
    if (value && typeof value === "object") {
      for (const inner of CANDIDATES) {
        const nested = (value as Record<string, unknown>)[inner];
        if (Array.isArray(nested)) return nested as Record<string, unknown>[];
      }
    }
  }
  return [];
}

/**
 * Search people through the marketplace.
 *
 * Never throws. This is a fallback for a search that already returned nothing,
 * so a failure here must leave the caller exactly where it was — with an empty
 * result and an honest message — rather than turning an empty page into an
 * error page.
 */
export async function coldiqSearchPeople(
  input: ColdIqPeopleSearch,
): Promise<{ records: Record<string, unknown>[]; error?: string }> {
  if (!coldiqApiKey()) return { records: [], error: "COLDIQ_API_KEY not set" };

  const path = Deno.env.get("COLDIQ_SEARCH_PATH") || DEFAULT_SEARCH_PATH;
  const url = `${coldiqBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...coldiqAuthHeaders() },
      // Confirmed against the spec: filters go inside `input`, not at the top
      // level. Apollo results come back obfuscated unless reveal=true, which
      // costs an extra credit per person — not set, so a masked record simply
      // fails the mapper's name/company check and is dropped.
      body: JSON.stringify({ input: compact(input), ...coldiqSpendCap() }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 500);
      console.error(`[coldiq] people search ${res.status} at ${url}:`, detail);
      return { records: [], error: `ColdIQ returned ${res.status}` };
    }

    const payload = await res.json();
    logShape("people search", payload);
    return { records: extractRecords(payload) };
  } catch (e) {
    console.error("[coldiq] people search failed:", (e as Error).message);
    return { records: [], error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
