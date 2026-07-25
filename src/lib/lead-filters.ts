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

const ALLOWED_SIZES = new Set(["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"]);
const JOB_KEYWORD_RE = /ceo|cto|cfo|founder|director|vp|head|manager|executive|owner/i;

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

  // Use the first job title only — the data source doesn't support boolean OR syntax
  if (aiFilters.jobTitles?.length) {
    newFilters.job_title = aiFilters.jobTitles[0];
  }

  // Industry: ignore generic "B2B" (it kills recall)
  const rawIndustry = aiFilters.industries?.[0]?.trim();
  if (rawIndustry && !/^b2b$/i.test(rawIndustry)) {
    newFilters.industry = rawIndustry;
  } else if (rawIndustry) {
    newFilters.keywords = [...(newFilters.keywords || []), rawIndustry];
  }

  // Company size: only allow known buckets
  const rawSize = aiFilters.companySizes?.[0]?.trim();
  if (rawSize && ALLOWED_SIZES.has(rawSize)) {
    newFilters.company_size = rawSize;
  }

  if (aiFilters.locations?.length) {
    newFilters.country = aiFilters.locations[0];
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
