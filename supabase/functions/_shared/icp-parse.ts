/**
 * Deterministic post-processing for a parsed ICP.
 *
 * The LLM's only job is reading the sentence. Everything that decides whether a
 * value survives the search pipeline happens here, in code, because it has to
 * be exact and testable: an industry the taxonomy does not contain matches
 * nothing upstream, and a size bucket the backend cannot parse numerically is
 * dropped without a word.
 *
 * Nothing in here invents a value. Every field is either read from the query or
 * absent — a filter the user did not ask for is worse than no filter, because
 * it silently narrows or widens the result set they are judging.
 */

import {
  normalizeCompanySize,
  normalizeCountry,
  normalizeIndustry,
  normalizeSeniority,
} from "./icp-vocab.ts";

/** Raw shape requested from the model, before any validation. */
export interface RawIcpParse {
  jobTitles?: unknown;
  seniorities?: unknown;
  industries?: unknown;
  companySizes?: unknown;
  locations?: unknown;
  keywords?: unknown;
  excludeTitles?: unknown;
  excludeIndustries?: unknown;
  excludeKeywords?: unknown;
}

/** Validated, normalised ICP. Every array is deduped and non-empty or absent. */
export interface ParsedIcp {
  jobTitles: string[];
  seniorities: string[];
  industries: string[];
  companySizes: string[];
  locations: string[];
  keywords: string[];
  excludeTitles: string[];
  excludeIndustries: string[];
  excludeKeywords: string[];
}

/** Caps: an ICP wider than this is noise, and each entry costs a fan-out search. */
const MAX_VALUES_PER_FIELD = 8;
const MAX_VALUE_LENGTH = 80;

/**
 * Coerce whatever the model returned into a clean string array.
 *
 * Models return a bare string for single-value fields, nulls inside arrays, and
 * occasionally nested arrays. Accepting only `string[]` would silently discard
 * a correctly-read filter over a formatting quirk.
 */
export function toStringArray(value: unknown): string[] {
  const flat: unknown[] = Array.isArray(value) ? value.flat(2) : [value];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of flat) {
    if (typeof entry !== "string" && typeof entry !== "number") continue;
    const text = String(entry).trim();
    if (!text || text.length > MAX_VALUE_LENGTH) continue;
    // Models sometimes echo "none"/"n/a" instead of omitting a field.
    if (/^(none|n\/a|null|unknown|any|not specified)$/i.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= MAX_VALUES_PER_FIELD) break;
  }
  return out;
}

/**
 * Snap a headcount range onto something the backend can read numerically.
 *
 * The backend turns "N-M" into a headcount range and "N+" into a lower bound;
 * anything else is dropped. Word buckets resolve through the shared map first,
 * then free-form ranges are rewritten to the containing standard bucket.
 */
export function toSizeBucket(raw: string): string | null {
  const mapped = normalizeCompanySize(raw);
  if (/^\d+\s*[-–]\s*\d+$/.test(mapped) || /^\d+\s*\+$/.test(mapped)) {
    return mapped.replace(/\s+/g, "");
  }

  const numbers = raw.match(/\d[\d,]*/g)?.map((n) => Number(n.replace(/,/g, "")));
  if (!numbers?.length) return null;

  const upperBoundOnly = /\b(under|below|less than|up to|fewer than)\b|^</i.test(raw);
  if (upperBoundOnly) {
    // Preserve the whole requested ceiling. Mapping "under 50" to the first
    // bucket (1-10) silently excluded companies with 11-49 employees.
    const ceiling = Math.max(...numbers);
    return ceiling > 0 ? `1-${ceiling}` : null;
  }

  const anchor = Math.min(...numbers);

  const buckets: Array<[string, number]> = [
    ["1-10", 10],
    ["11-50", 50],
    ["51-200", 200],
    ["201-500", 500],
    ["501-1000", 1000],
  ];
  for (const [bucket, max] of buckets) {
    if (anchor <= max) return bucket;
  }
  return "1000+";
}

/**
 * Validate and normalise a raw parse.
 *
 * Industries that do not resolve to a taxonomy value are not sent as an
 * industry filter — that filter would match nothing — they are demoted to
 * keywords, where they still influence ranking without silently zeroing the
 * result set. Same for sizes that cannot be read as a range.
 */
export function normalizeIcp(raw: RawIcpParse): ParsedIcp {
  const jobTitles = toStringArray(raw.jobTitles);
  const keywords = toStringArray(raw.keywords);

  const industries: string[] = [];
  const demoted: string[] = [];
  for (const value of toStringArray(raw.industries)) {
    // "B2B" is not an industry in any taxonomy and matches nothing on its own.
    if (/^b2b$/i.test(value)) {
      demoted.push(value);
      continue;
    }
    const normalized = normalizeIndustry(value);
    if (normalized) industries.push(normalized);
    else demoted.push(value);
  }

  const companySizes: string[] = [];
  for (const value of toStringArray(raw.companySizes)) {
    const bucket = toSizeBucket(value);
    if (bucket && !companySizes.includes(bucket)) companySizes.push(bucket);
  }

  const seniorities: string[] = [];
  for (const value of toStringArray(raw.seniorities)) {
    const normalized = normalizeSeniority(value);
    if (normalized && !seniorities.includes(normalized)) seniorities.push(normalized);
  }

  const locations: string[] = [];
  for (const value of toStringArray(raw.locations)) {
    const normalized = normalizeCountry(value);
    if (normalized && !locations.includes(normalized)) locations.push(normalized);
  }

  const mergedKeywords = [...keywords];
  for (const value of demoted) {
    if (!mergedKeywords.some((k) => k.toLowerCase() === value.toLowerCase())) {
      mergedKeywords.push(value);
    }
  }

  return {
    jobTitles,
    seniorities,
    industries,
    companySizes,
    locations,
    keywords: mergedKeywords.slice(0, MAX_VALUES_PER_FIELD),
    excludeTitles: toStringArray(raw.excludeTitles),
    excludeIndustries: toStringArray(raw.excludeIndustries),
    excludeKeywords: toStringArray(raw.excludeKeywords),
  };
}

/** True when nothing usable was read — the caller must not search on this. */
export function isEmptyIcp(icp: ParsedIcp): boolean {
  return (
    icp.jobTitles.length === 0 &&
    icp.seniorities.length === 0 &&
    icp.industries.length === 0 &&
    icp.companySizes.length === 0 &&
    icp.locations.length === 0 &&
    icp.keywords.length === 0
  );
}

/**
 * Pull a JSON object out of a model response.
 *
 * Even in JSON mode a model can wrap the object in a fence or add a sentence
 * before it, so this tries the strict parse first and falls back to the
 * outermost braces rather than failing the whole search on a stray character.
 */
export function extractJsonObject(content: string): RawIcpParse | null {
  const attempts: string[] = [];
  const trimmed = content.trim();
  if (trimmed) attempts.push(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(trimmed.slice(first, last + 1));

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as RawIcpParse;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}
