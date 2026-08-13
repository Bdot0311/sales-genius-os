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
  const newFilters: ExternalLeadFilters = { limit: pageSize, exclude_seen: true };
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
