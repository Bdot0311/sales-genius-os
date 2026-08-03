import { ExternalLeadFilters } from "@/hooks/use-external-leads";

// Structured filter shape produced by the `parse-lead-query` and `analyze-domain`
// edge functions. Both the "Describe your ICP" and "Analyze your website" flows
// feed this into buildExternalFilters() so there is exactly one mapping into the
// lead-search pipeline.
export interface ParsedIcpFilters {
  jobTitles?: string[];
  industries?: string[];
  companySizes?: string[];
  locations?: string[];
  keywords?: string[];
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
 * Snap a free-form headcount range onto the buckets the provider accepts.
 *
 * The parser is an LLM and returns whatever the user typed — "2-10", "under 50",
 * "50-100". Anything outside the six known buckets was dropped silently, so
 * "SaaS companies with 2-10 people" searched every company size. Mapping onto
 * the containing bucket keeps the constraint instead of discarding it.
 */
export function normalizeCompanySizeBucket(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (ALLOWED_SIZE_SET.has(value)) return value;

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
// edge function consumes. Extracted verbatim from the original inline mapping in
// Leads.tsx so the describe flow's behavior is unchanged; the website flow reuses it.
// Railway/data-source quirks preserved: first job title only (no boolean OR),
// drop generic "B2B" industry, only known size buckets.
export function buildExternalFilters(
  aiFilters: ParsedIcpFilters,
  pageSize: number,
): ExternalLeadFilters {
  const newFilters: ExternalLeadFilters = { limit: pageSize };

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

  // Company size: snap onto a known bucket rather than dropping what doesn't
  // already match one.
  const size = normalizeCompanySizeBucket(aiFilters.companySizes?.[0]);
  if (size) {
    newFilters.company_size = size;
  }

  const locations = (aiFilters.locations || []).map((l) => l.trim()).filter(Boolean);
  if (locations.length) {
    newFilters.country = locations[0];
    if (locations.length > 1) newFilters.countries = locations;
  }

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
