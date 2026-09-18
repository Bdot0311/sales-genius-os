import { ExternalLeadFilters } from "@/hooks/use-external-leads";

// Structured filter shape produced by the `parse-lead-query` and `analyze-domain`
// edge functions. Both the "Describe your ICP" and "Analyze your website" flows
// feed this into buildExternalFilters() so there is exactly one mapping into the
// lead-search pipeline.
export interface ParsedIcpFilters {
  jobTitles?: string[];
  seniorities?: string[];
  industries?: string[];
  companySizes?: string[];
  locations?: string[];
  keywords?: string[];
  // Explicit negatives from the query ("founders, not co-founders"). The edge
  // function filters these out of the results; before the parser extracted
  // them they were simply lost.
  excludeTitles?: string[];
  excludeIndustries?: string[];
  excludeKeywords?: string[];
  limit?: number;
}

const ALLOWED_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
const ALLOWED_SIZE_SET = new Set<string>(ALLOWED_SIZES);
const JOB_KEYWORD_RE = /ceo|cto|cfo|founder|director|vp|head|manager|executive|owner/i;

// Upper bound of each bucket, used to place an arbitrary range on the scale.
const SIZE_BUCKET_MAX: Array<[string, number]> = [
  ["1-10", 10],
  ["11-50", 50],
  ["51-200", 200],
  ["201-500", 500],
  ["501-1000", 1000],
  ["1000+", Number.POSITIVE_INFINITY],
];

/**
 * Resolve a free-form headcount into something the backend can read.
 *
 * Anything outside the six standard buckets used to be dropped silently, so
 * "SaaS companies with 2-10 people" searched every company size. An exact range
 * is kept as-is because the backend reads it numerically; only a range it could
 * not parse is snapped onto the bucket containing its floor.
 */
export function normalizeCompanySizeBucket(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (ALLOWED_SIZE_SET.has(value)) return value;

  // The backend reads any "N-M" as a headcount range and "N+" as a lower bound,
  // so an exact range the user gave is kept rather than rounded to the nearest
  // standard bucket — "2-10" searches 2 to 10, not 1 to 10.
  const exact = value.replace(/\s+/g, "");
  if (/^\d+[-–]\d+$/.test(exact) || /^\d+\+$/.test(exact)) return exact.replace("–", "-");

  const numbers = value.match(/\d[\d,]*/g)?.map((n) => Number(n.replace(/,/g, "")));
  if (!numbers?.length) return undefined;

  // "under 50" describes an upper bound; anything else anchors on the smallest
  // number present, which is the range's floor.
  const anchor = /\b(under|below|less than|up to|fewer than)\b|^</i.test(value)
    ? 1
    : Math.min(...numbers);

  for (const [bucket, max] of SIZE_BUCKET_MAX) {
    if (anchor <= max) return bucket;
  }
  return "1000+";
}

// Maps the structured ICP filters to the ExternalLeadFilters the fetch-external-leads
// edge function consumes. Both the "Describe your ICP" and "Analyze your website"
// flows go through here, so there is one mapping into the search pipeline.
//
// The provider takes a single value per field, so each singular field carries
// the first value and the plural field carries the whole list for the edge
// function to fan out over. Generic "B2B" is demoted to a keyword because it
// matches no industry taxonomy, and headcount ranges are snapped onto a bucket
// the backend can read numerically.
export function buildExternalFilters(
  aiFilters: ParsedIcpFilters,
  pageSize: number,
  originalQuery?: string,
): ExternalLeadFilters {
  // Leads already saved are dropped from results. Without this every search
  // re-showed the people from the last one: the provider returns its first page
  // for a given filter set, and that page does not change because you saved
  // some of it. The agent has always done this; the manual search did not, so
  // it was the surface where the repetition was most obvious.
  // How many, in order of who actually said it: the sentence the user typed,
  // then the parser's reading of it, then the caller's default. The sentence
  // used to lose to a dropdown, so "find me 25 founders" returned ten.
  const requested = originalQuery ? parseRequestedCount(originalQuery) : null;
  const limit = Math.min(Math.max(requested ?? aiFilters.limit ?? pageSize, 1), 100);

  const newFilters: ExternalLeadFilters = { limit, exclude_seen: true };
  if (originalQuery?.trim()) newFilters.query = originalQuery.trim();

  // The provider takes one value per field, so the singular fields carry the
  // first of each. The plural fields carry the rest: the edge function fans a
  // multi-title ICP out into one search per title and merges the results, which
  // is the only way "CEOs and Founders" searches for both. Sending only the
  // singular field silently threw away every value the user asked for after the
  // first.
  if (aiFilters.jobTitles?.length) {
    newFilters.job_title = aiFilters.jobTitles[0];
    if (aiFilters.jobTitles.length > 1) newFilters.job_titles = aiFilters.jobTitles;
  }

  // Industry: ignore generic "B2B" (it kills recall)
  const industries = (aiFilters.industries || []).map((i) => i.trim()).filter(Boolean);
  const realIndustries = industries.filter((i) => !/^b2b$/i.test(i));
  if (realIndustries.length) {
    newFilters.industry = realIndustries[0];
    if (realIndustries.length > 1) newFilters.industries = realIndustries;
  } else if (industries.length) {
    newFilters.keywords = [...(newFilters.keywords || []), ...industries];
  }

  // Company size: resolve to a readable range rather than dropping anything
  // that isn't already one of the six standard buckets.
  const size = normalizeCompanySizeBucket(aiFilters.companySizes?.[0]);
  if (size) {
    newFilters.company_size = size;
  }

  const locations = (aiFilters.locations || []).map((l) => l.trim()).filter(Boolean);
  if (locations.length) {
    newFilters.country = locations[0];
    if (locations.length > 1) newFilters.countries = locations;
  }

  const seniorities = (aiFilters.seniorities || []).map((s) => s.trim()).filter(Boolean);
  if (seniorities.length) {
    newFilters.seniority = seniorities[0];
    if (seniorities.length > 1) newFilters.seniority_levels = seniorities;
  }

  // Negatives are honoured by the edge function's ICP excluder.
  const excludeTitles = (aiFilters.excludeTitles || []).filter(Boolean);
  if (excludeTitles.length) newFilters.exclude_titles = excludeTitles;
  const excludeIndustries = (aiFilters.excludeIndustries || []).filter(Boolean);
  if (excludeIndustries.length) newFilters.exclude_industries = excludeIndustries;
  const excludeKeywords = (aiFilters.excludeKeywords || []).filter(Boolean);
  if (excludeKeywords.length) newFilters.exclude_keywords = excludeKeywords;

  // Pass keywords for fallback extraction in edge function
  if (aiFilters.keywords?.length) {
    newFilters.keywords = aiFilters.keywords;
  }

  // If no job titles but keywords exist, try to build job_title from keywords
  if (!newFilters.job_title && aiFilters.keywords?.length) {
    const jobKeywords = aiFilters.keywords.filter((k) => JOB_KEYWORD_RE.test(k));
    if (jobKeywords.length > 0) {
      newFilters.job_title = jobKeywords[0]; // use first match only
    }
  }

  return newFilters;
}

// Accepts "acme.com", "www.acme.com", "https://acme.com/pricing" → "acme.com".
// Returns null for anything that isn't a plausible domain.
export function normalizeDomain(input: string): string | null {
  let raw = input.trim().toLowerCase();
  if (!raw || /\s/.test(raw)) return null;
  if (!/^https?:\/\//.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "");
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

export function isValidDomain(input: string): boolean {
  return normalizeDomain(input) !== null;
}

/**
 * The search criteria, in the words a person would use.
 *
 * A lead search is one upstream call that can run for several seconds, and the
 * wait used to be five identical grey rows: nothing to read, nothing to check,
 * no way to tell a slow search from a stuck one. The filters are already known
 * on this side before the request leaves, and they are the most useful thing
 * there is to show — they are the parser's reading of the sentence that was
 * typed, so seeing "Role: Founders" and no industry is how someone finds out
 * their query was understood too broadly, while it is still running.
 *
 * Plural fields carry every value and the singular field carries the first of
 * them, so reading the plural where it exists avoids listing the first twice.
 */
export function describeFilters(
  filters: ExternalLeadFilters,
): Array<{ label: string; values: string[] }> {
  const pick = (many?: string[], one?: string) => {
    const list = many?.length ? many : one ? [one] : [];
    return list.map((v) => v.trim()).filter(Boolean);
  };

  const excluded = [
    ...(filters.exclude_titles ?? []),
    ...(filters.exclude_industries ?? []),
    ...(filters.exclude_keywords ?? []),
  ]
    .map((v) => v.trim())
    .filter(Boolean);

  const rows: Array<{ label: string; values: string[] }> = [
    // Read the count back. It comes from the sentence now rather than from a
    // dropdown, so showing it is how someone sees their number landed — while
    // the search is still running, rather than by counting the results.
    { label: "How many", values: filters.limit ? [String(filters.limit)] : [] },
    { label: "Role", values: pick(filters.job_titles, filters.job_title) },
    { label: "Seniority", values: pick(filters.seniority_levels, filters.seniority) },
    { label: "Industry", values: pick(filters.industries, filters.industry) },
    { label: "Location", values: pick(filters.countries, filters.country) },
    { label: "Company size", values: pick(undefined, filters.company_size) },
    { label: "Keywords", values: pick(filters.keywords) },
    { label: "Excluding", values: excluded },
  ];

  return rows.filter((row) => row.values.length > 0);
}

/**
 * How many people the sentence asked for.
 *
 * The count used to live in a "Show: 10" dropdown next to the pager, and the
 * sentence was ignored: parse-lead-query returns a limit when someone writes
 * "find me 25 founders", buildExternalFilters overwrote it with the dropdown's
 * value, and the search came back with ten. Asking for a number and being given
 * a different one is the kind of small lie that costs trust in everything else
 * on the page.
 *
 * A lead query is full of numbers that are not the count: "1-10 employees",
 * "founded 2019-2024", "over 15 employees", "Series A". Reading the wrong one
 * spends the user's credits on the wrong search, so this is deliberately hard
 * to trigger:
 *
 *  - the number has to be followed by a word that means people, or by "of them"
 *  - it cannot sit inside a range, which is how sizes and years are written
 *  - it cannot follow a word that introduces a size or a date
 *
 * Everything else is left alone and the default stands.
 */
const COUNT_NOUNS =
  "leads?|founders?|co-?founders?|ceos?|ctos?|cfos?|cmos?|coos?|execs?|executives?|prospects?|contacts?|names?|results?|rows?|of them|of these";

/** Words that make the next number a company size, a year or a funding round. */
const NOT_A_COUNT_BEFORE =
  /(?:with|under|over|above|below|up to|at least|at most|fewer than|less than|more than|between|founded|since|from|employing|headcount of|size)\s*$/i;

export function parseRequestedCount(query: string): number | null {
  if (!query) return null;
  const re = new RegExp(`(\\d{1,4})\\s*(?:${COUNT_NOUNS})\\b`, "gi");

  for (const match of query.matchAll(re)) {
    const digits = match[1];
    const at = match.index ?? 0;

    // Inside a range: "1-10 people", "2019-2024". The hyphen on either side is
    // what tells a size or a year apart from a request.
    const before = query.slice(Math.max(0, at - 2), at);
    const after = query.slice(at + digits.length, at + digits.length + 2);
    if (/[-–—]\s*$/.test(before) || /^\s*[-–—]\s*\d/.test(after)) continue;

    // Introduced as a size or a date rather than as an amount to return.
    if (NOT_A_COUNT_BEFORE.test(query.slice(0, at))) continue;

    const n = Number(digits);
    if (!Number.isFinite(n) || n < 1) continue;
    // The provider caps a page at 100; asking for more is not an error, it just
    // gets the most it can give.
    return Math.min(n, 100);
  }
  return null;
}
