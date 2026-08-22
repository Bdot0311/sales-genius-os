import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlanSearchLimits } from "../_shared/plan-limits.ts";
// One vocabulary for the whole pipeline — see _shared/icp-vocab.ts.
import {
  normalizeCountry,
  normalizeIndustry,
  normalizeSeniority,
  normalizeCompanySize,
  semanticTermsIn,
} from "../_shared/icp-vocab.ts";
// The same fit engine the saved-lead scorer uses, so a lead's ICP score in
// search is the number it keeps once saved.
import {
  computeFit,
  DEFAULT_RUBRIC,
  type IcpInput,
  type LeadInput,
} from "../_shared/lead-scoring.ts";
// Bounce prevention. Leads are verified before they are ever shown, so an
// address the user can see is one we have actually checked — see
// _shared/email-verify.ts for the two-layer (free DNS, then paid SMTP) design.
import { verifyEmails, hasPaidVerifier, type VerificationStatus } from "../_shared/email-verify.ts";
import { emailDomainMismatch, isCompanyLinkedIn, isPersonLinkedIn, normalizeDomain } from "../_shared/email-rules.ts";
// Last-resort lead sourcing. Only runs when the primary provider returned
// nothing — see _shared/coldiq.ts for why there is no "always" mode.
import { coldiqLeadsMode, coldiqSearchPeople, coldiqConfigured } from "../_shared/coldiq.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExternalLeadFilters {
  query?: string;
  job_title?: string;
  industry?: string;
  company_size?: string;
  country?: string;
  company?: string;
  company_domain?: string;
  companies?: Array<{ name?: string; domain?: string }>;
  seniority?: string;
  keywords?: string[];
  limit?: number;
  page?: number;
  /**
   * Opaque provider cursor, echoed from a previous response's `next_cursor`.
   *
   * The backend has always paged by cursor and returned one; nothing here ever
   * sent or read it, so paging fell back to offsets and stopped at the
   * provider's row ceiling. Passing it through is what lets a run page past
   * that.
   */
  cursor?: string;
  // ─── Full-ICP filters (sent by the AI SDR agent and ICP-driven searches) ───
  // The upstream provider only accepts one value per field, so multi-value ICP
  // filters are fanned out into several searches and merged here.
  job_titles?: string[];
  industries?: string[];
  countries?: string[];
  seniority_levels?: string[];
  exclude_titles?: string[];
  exclude_industries?: string[];
  exclude_keywords?: string[];
  /** When true, never relax ICP filters to backfill results (agent searches). */
  strict?: boolean;
  /**
   * When true, a search that finds nothing may retry without industry/keywords.
   * Off by default: results that do not match the stated ICP are worse than no
   * results, because nothing tells the user they stopped matching. The UI sets
   * this only when the user explicitly asks to broaden.
   */
  relax?: boolean;
  /** When true, drop leads the user already has saved so runs don't repeat. */
  exclude_seen?: boolean;
}

const strList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => (x as string).trim())
    : [];

/** Builds a predicate that drops leads matching the ICP's exclusion lists. */
function buildIcpExcluder(filters: ExternalLeadFilters): ((lead: any) => boolean) | null {
  const lower = (arr: string[]) => arr.map((s) => s.toLowerCase());
  const titles = lower(strList(filters.exclude_titles));
  const industries = lower(strList(filters.exclude_industries));
  const keywords = lower(strList(filters.exclude_keywords));
  if (!titles.length && !industries.length && !keywords.length) return null;
  return (lead: any) => {
    const title = String(lead?.job_title ?? '').toLowerCase();
    const industry = String(lead?.industry ?? '').toLowerCase();
    const blob = `${title} ${industry} ${String(lead?.company_name ?? '')}`.toLowerCase();
    if (title && titles.some((t) => title.includes(t))) return false;
    if (industry && industries.some((t) => industry.includes(t))) return false;
    if (keywords.some((t) => blob.includes(t))) return false;
    return true;
  };
}

async function createUsageEvent(
  supabase: any,
  filters: ExternalLeadFilters,
  userId: string,
  plan = 'free',
  isAdmin = false,
  creditsCharged = 0,
  balanceAfter: number | null = null
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('search_usage_events')
      .insert({
        user_id: userId,
        search_type: 'lead_search',
        filters: filters as any,
        provider: 'railway',
        // Denormalised on purpose: the tier at the time of the search, so a
        // later upgrade or downgrade does not rewrite history.
        plan,
        is_admin: isAdmin,
        credits_charged: creditsCharged,
        credit_balance_after: balanceAfter,
        status: 'started',
      })
      .select('id')
      .single();
    return data?.id || null;
  } catch (e) {
    console.error('Failed to create search usage event:', e);
    return null;
  }
}

async function updateUsageEvent(
  supabase: any,
  usageEventId: string | null,
  status: string,
  resultsCount = 0,
  errorCode?: string,
  providerSource?: string,
  providerTotal?: number,
  creditUpdate?: { creditsCharged?: number; creditBalanceAfter?: number | null },
  // Per-provider outcome. Searches call every configured provider and the
  // providers bill per result returned, so this is what the search actually
  // cost and where: a provider that surfaced nothing charged nothing.
  providerBreakdown?: unknown,
) {
  if (!usageEventId) return;
  const update: Record<string, unknown> = {
    results_count: resultsCount,
    provider_source: providerSource,
    provider_total: providerTotal,
    status,
    error_code: errorCode,
  };
  if (providerBreakdown !== undefined) {
    update.provider_breakdown = providerBreakdown;
  }
  if (creditUpdate?.creditsCharged !== undefined) {
    update.credits_charged = creditUpdate.creditsCharged;
  }
  if (creditUpdate?.creditBalanceAfter !== undefined) {
    update.credit_balance_after = creditUpdate.creditBalanceAfter;
  }
  try {
    await supabase.from('search_usage_events').update(update).eq('id', usageEventId);
  } catch (e) {
    console.error('Failed to update search usage event:', e);
  }
}


interface LeadScores {
  /** Null when the user has stated no ICP — nothing to measure against. */
  icp_score: number | null;
  /** Always null in search: intent needs fired signals, which need enrichment. */
  intent_score: number | null;
  enrichment_score: number;
  overall_score: number;
}

interface ScoredLead {
  job_title: string;
  company_name: string;
  company_domain: string;
  business_email: string | null;
  contact_name: string;
  industry: string;
  company_size: string;
  country: string;
  linkedin_url: string | null;
  company_linkedin?: string | null;
  email_domain_mismatch?: boolean;
  scores: LeadScores;
  score_explanation: string;
  buying_signals: string[];
  // Populated by applyVerification() before the response is sent. `null` means
  // the lead arrived without an email at all, so there was nothing to check.
  email_verification_status?: VerificationStatus | null;
  email_verified?: boolean | null;
  email_verification_reason?: string | null;
}









// Job-related keywords to extract from keywords array
const JOB_KEYWORDS = [
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'cpo', 'cro',
  'founder', 'co-founder', 'cofounder', 'owner',
  'president', 'vice president', 'vp',
  'director', 'head', 'chief',
  'manager', 'lead', 'senior', 'executive',
  'partner', 'principal'
];

// Extract job titles from keywords and return remaining keywords
function extractJobTitleFromKeywords(keywords: string[]): { jobTitle: string | null; remaining: string[] } {
  if (!keywords || keywords.length === 0) return { jobTitle: null, remaining: [] };
  
  const foundJobs: string[] = [];
  const remaining: string[] = [];
  
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    let isJob = false;
    for (const jobKeyword of JOB_KEYWORDS) {
      if (lower.includes(jobKeyword)) {
        foundJobs.push(keyword);
        isJob = true;
        break;
      }
    }
    if (!isJob) {
      remaining.push(keyword);
    }
  }
  
  return {
    jobTitle: foundJobs.length > 0 ? foundJobs.join(' OR ') : null,
    remaining,
  };
}

// Simple hash for deterministic but varied per-lead offsets
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Score a search result.
 *
 * `icp_score` is measured against the user's actual ICP profile, by the same
 * computeFit the saved-lead scorer uses, so the number a lead shows in search is
 * the number it keeps after saving. It used to be a generic seniority table —
 * CEO 38, VP 22, director 18 — plus a hash-derived jitter of ±5 per lead, which
 * meant it never consulted the ICP at all: a CEO outside every stated industry,
 * size band and geography still scored 78.
 *
 * `intent_score` is null. Intent is measured from fired signals, and a lead
 * nobody has researched yet has none — the score arrives once it is saved and
 * enriched, which is when the tech, funding and hiring detectors run. The old
 * value was a base of 35 plus points for having "sales" in the job title, plus
 * its own jitter axis. It moved between leads, so it looked like a measurement,
 * but nothing in it had anything to do with buying intent.
 */
function calculateScores(lead: any, icp: IcpInput | null): LeadScores {
  // Kept for the enrichment axis only — completeness genuinely varies per lead
  // and this keeps ordering stable across repeated searches.
  const seedStr = `${lead.contact_name || ''}|${lead.company_name || ''}|${lead.company_domain || ''}|${lead.job_title || ''}`;
  const seed = hashString(seedStr);

  let enrichmentScore = 30;

  const jobTitle = (lead.job_title || '').toLowerCase();
  const jobTitleWords = jobTitle.split(/[\s,/]+/).filter(Boolean);

  // === ICP FIT — measured against the user's stated ICP ===
  // computeFit only counts dimensions the ICP actually specifies, so a lead is
  // not penalised for a criterion left blank, and returns null-equivalent when
  // there is no ICP at all: nothing has been stated to match against, so the
  // honest answer is "unknown" rather than a number.
  const icpScore = icp
    ? computeFit(
        {
          job_title: lead.job_title,
          industry: lead.industry,
          company_size: lead.company_size,
          country: lead.country,
          technologies: lead.technologies ?? null,
        } as LeadInput,
        icp,
        DEFAULT_RUBRIC,
      ).score
    : null;

  // === ENRICHMENT / DATA COMPLETENESS SCORING ===
  const email = lead.business_email || lead.email || '';
  if (email) {
    enrichmentScore += 18;
    // Corporate email vs generic
    if (!email.includes('gmail.') && !email.includes('yahoo.') && !email.includes('hotmail.') && !email.includes('outlook.')) {
      enrichmentScore += 5;
    }
  }
  if (lead.linkedin_url || lead.linkedin) enrichmentScore += 12;
  if (lead.company_domain || lead.domain) enrichmentScore += 10;
  if (lead.industry) enrichmentScore += 5;
  if (lead.country || lead.location) enrichmentScore += 5;
  if (lead.company_name) enrichmentScore += 3;
  if (lead.contact_name) enrichmentScore += 2;
  if (lead.seniority) enrichmentScore += 3;
  if (lead.department) enrichmentScore += 2;
  if (jobTitleWords.length >= 4) enrichmentScore += 3;
  enrichmentScore += ((seed >> 3) % 5) - 2;
  enrichmentScore = Math.max(5, Math.min(100, enrichmentScore));

  // Intent is absent from the overall score rather than weighted at a made-up
  // value: it is genuinely unknown until the lead is enriched, and folding a
  // placeholder in would rank leads by a number nobody measured.
  const overallScore = icpScore == null
    ? enrichmentScore
    : Math.round(icpScore * 0.65 + enrichmentScore * 0.35);

  return {
    icp_score: icpScore,
    intent_score: null,
    enrichment_score: enrichmentScore,
    overall_score: Math.max(5, Math.min(100, overallScore)),
  };
}

// Generate score explanation with specifics
function generateScoreExplanation(lead: any, scores: LeadScores): string {
  const parts: string[] = [];
  
  // No ICP stated means nothing to match against; claiming a "low ICP match"
  // would blame the lead for a profile the user never filled in.
  if (scores.icp_score == null) {
    parts.push('No ICP set — add one to score fit');
  } else if (scores.icp_score >= 85) {
    parts.push('Excellent ICP match');
  } else if (scores.icp_score >= 70) {
    parts.push('Strong ICP match');
  } else if (scores.icp_score >= 55) {
    parts.push('Good ICP fit');
  } else if (scores.icp_score >= 40) {
    parts.push('Moderate ICP fit');
  } else {
    parts.push('Low ICP match');
  }

  const jobTitle = (lead.job_title || '').toLowerCase();
  if (jobTitle.includes('ceo') || jobTitle.includes('founder') || jobTitle.includes('owner') || jobTitle.includes('president')) {
    parts.push('Top executive / decision maker');
  } else if (jobTitle.includes('cto') || jobTitle.includes('cfo') || jobTitle.includes('coo') || jobTitle.includes('cmo') || jobTitle.includes('cro')) {
    parts.push('C-suite leader');
  } else if (jobTitle.includes('vp') || jobTitle.includes('vice president')) {
    parts.push('VP-level authority');
  } else if (jobTitle.includes('director')) {
    parts.push('Director-level influence');
  } else if (jobTitle.includes('head of') || jobTitle.includes('head,')) {
    parts.push('Department head');
  } else if (jobTitle.includes('manager')) {
    parts.push('Management level');
  }

  // Intent is unknown until the lead is enriched and the signal detectors run,
  // so search never claims it. The old branch fired on a made-up number.
  if (scores.intent_score != null && scores.intent_score >= 60) {
    parts.push('High buying intent signals');
  }

  if (lead.industry) {
    parts.push(`${lead.industry}`);
  }

  if (scores.enrichment_score >= 75) {
    parts.push('Rich data profile');
  } else if (scores.enrichment_score < 40) {
    parts.push('Limited data available');
  }

  return parts.length > 0 ? parts.join(' · ') : 'Lead discovered from search';
}

// Generate buying signals
function generateBuyingSignals(lead: any): string[] {
  const signals: string[] = [];
  const jobTitle = (lead.job_title || '').toLowerCase();
  const industry = (lead.industry || '').toLowerCase();
  const companySize = (lead.company_size || '').toString();

  // Decision maker signals
  if (jobTitle.includes('ceo') || jobTitle.includes('founder') || jobTitle.includes('owner') || jobTitle.includes('president')) {
    signals.push('Key Decision Maker');
  } else if (jobTitle.includes('vp') || jobTitle.includes('director') || jobTitle.includes('head')) {
    signals.push('Decision Maker');
  }

  // Budget authority
  if (jobTitle.includes('cfo') || jobTitle.includes('finance') || jobTitle.includes('procurement')) {
    signals.push('Budget Authority');
  }

  // Tech buyer
  if (jobTitle.includes('tech') || jobTitle.includes('it') || jobTitle.includes('engineer') ||
      jobTitle.includes('developer') || jobTitle.includes('cto') || jobTitle.includes('devops')) {
    signals.push('Tech Buyer');
  }

  // Revenue / growth
  if (jobTitle.includes('sales') || jobTitle.includes('revenue') || jobTitle.includes('growth') || jobTitle.includes('business development')) {
    signals.push('Revenue Focus');
  }

  // Marketing
  if (jobTitle.includes('marketing') || jobTitle.includes('cmo') || jobTitle.includes('brand') || jobTitle.includes('demand')) {
    signals.push('Marketing Leader');
  }

  // Company size signals
  if (companySize.includes('201') || companySize.includes('500') || companySize.includes('1001')) {
    signals.push('Mid-Market');
  } else if (companySize.includes('5001') || companySize.includes('10001')) {
    signals.push('Enterprise');
  }

  // Industry signals
  if (industry.includes('software') || industry.includes('technology')) {
    signals.push('Tech Industry');
  }

  // Email availability
  if (lead.business_email || lead.email) {
    signals.push('Email Available');
  }

  return signals.length > 0 ? signals : ['Prospect'];
}

// Map Railway response to ScoredLead format — handles many field name conventions
const makeLeadMapper = (icp: IcpInput | null) => (lead: any): ScoredLead =>
  mapRailwayLead(lead, icp);

function mapRailwayLead(lead: any, icp: IcpInput | null = null): ScoredLead {
  // Resolve field names across common API conventions
  const firstName = lead.first_name || lead.firstName || '';
  const lastName = lead.last_name || lead.lastName || '';
  const fullNameFromParts = (firstName && lastName) ? `${firstName} ${lastName}` : (firstName || lastName);

  const jobTitle = lead.job_title || lead.title || lead.position || lead.job_title_levels || lead.role || '';
  const companyName = lead.company_name || lead.company || lead.organization || lead.employer || lead.company_display_name || '';
  // Reduce to a bare hostname. Values arrive as domains, full URLs with paths,
  // and occasionally as junk; storing them verbatim is why a lead's website
  // sometimes points at a subpage or at nothing usable. The first candidate
  // that reads as a hostname wins, rather than the first that is merely
  // non-empty.
  const companyDomain = [lead.company_domain, lead.domain, lead.company_website, lead.website]
    .map((v: unknown) => normalizeDomain(String(v ?? '')))
    .find(Boolean) ?? '';
  const businessEmail = lead.business_email || lead.email || lead.work_email || lead.contact_email || null;
  const contactName = lead.contact_name || lead.full_name || lead.name || fullNameFromParts || '';
  const industry = lead.industry || lead.company_industry || lead.sector || lead.vertical || '';
  const companySize = lead.company_size || lead.employee_count || lead.employees ||
    lead.company_employee_count || lead.size || lead.employee_range || '';
  const country = lead.country || lead.location_country || lead.country_code ||
    lead.location || lead.geo_country || '';
  // LinkedIn: separate the person from the organisation.
  //
  // Providers disagree about what a bare `linkedin` field means and several use
  // it for the company page. Taking the first non-empty value stored company
  // URLs as the contact's profile, which is why opening one "doesn't find the
  // person". Personal profiles are /in/; companies are /company/.
  const linkedinCandidates = [
    lead.linkedin_url, lead.linkedin, lead.linkedin_profile,
    lead.profile_url, lead.linkedinUrl,
  ].map((v: unknown) => String(v ?? '').trim()).filter(Boolean);

  const linkedinUrl = linkedinCandidates.find((u) => isPersonLinkedIn(u)) ?? null;
  const companyLinkedin = [
    ...linkedinCandidates,
    String(lead.company_linkedin ?? '').trim(),
  ].filter(Boolean).find((u) => isCompanyLinkedIn(u)) ?? null;

  const normalised = {
    job_title: jobTitle,
    company_name: companyName,
    company_domain: companyDomain,
    business_email: businessEmail,
    contact_name: contactName,
    industry,
    company_size: String(companySize),
    country,
    linkedin_url: linkedinUrl,
    company_linkedin: companyLinkedin,
    // Surfaced, never used to drop the lead: acquisitions, rebrands and
    // personal addresses all produce legitimate mismatches. It flags that one
    // of the two fields was likely stitched on from a different record.
    email_domain_mismatch: emailDomainMismatch(businessEmail ?? '', companyDomain),
  };

  const scores = calculateScores(normalised, icp);

  return {
    ...normalised,
    scores,
    score_explanation: generateScoreExplanation(normalised, scores),
    buying_signals: generateBuyingSignals(normalised),
  };
}

// Fetch all cached leads from Railway as fallback
async function fetchCacheAllFallback(railwayBaseUrl: string): Promise<{ leads: ScoredLead[], from_cache: boolean, error?: string }> {
  try {
    const cacheUrl = railwayBaseUrl.replace('/search', '/cache/all');
    console.log('Fetching all cached leads from:', cacheUrl);
    
    const response = await fetch(cacheUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.log('Cache all not available:', response.status);
      return { leads: [], from_cache: false };
    }
    
    const data = await response.json();
    console.log('Cache all response:', JSON.stringify(data).substring(0, 500));
    
    if (data.leads && Array.isArray(data.leads) && data.leads.length > 0) {
      const leads = data.leads.map((l: any) => mapRailwayLead(l));
      return { leads, from_cache: true };
    }
    
    return { leads: [], from_cache: false };
  } catch (error) {
    console.error('Error fetching cache all:', error);
    return { leads: [], from_cache: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Fetch cached search results stats from Railway
async function fetchCachedResults(railwayBaseUrl: string): Promise<{ searches: any[], error?: string }> {
  try {
    const statsUrl = railwayBaseUrl.replace('/search', '/cache/stats');
    console.log('Fetching cache stats from:', statsUrl);
    
    const response = await fetch(statsUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      console.log('Cache stats not available:', response.status);
      return { searches: [] };
    }
    
    const data = await response.json();
    console.log('Cache stats:', JSON.stringify(data));
    return { searches: data.recent_searches || [] };
  } catch (error) {
    console.error('Error fetching cache stats:', error);
    return { searches: [], error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Verify every email in a result set before it reaches the user, and drop the
 * ones proven undeliverable.
 *
 * The requirement is "only show leads with emails that land", so a confirmed
 * dead mailbox is removed rather than badged — a badge still invites the user
 * to send. Everything unproven (catch-all, role, inconclusive, no verifier
 * configured) is kept and labelled, because refusing to show those would throw
 * away most of a result set to prevent a minority of bounces.
 *
 * Leads with no email at all pass through untouched. They are still worth
 * showing: the user can enrich or reach out on LinkedIn.
 */
async function applyVerification(
  supabase: any,
  leads: ScoredLead[],
): Promise<{ leads: ScoredLead[]; removed: number }> {
  const emails = leads.map((l) => l.business_email).filter((e): e is string => !!e);
  if (emails.length === 0) return { leads, removed: 0 };

  const started = Date.now();
  const verdicts = await verifyEmails(supabase, emails);

  let removed = 0;
  const kept: ScoredLead[] = [];
  for (const lead of leads) {
    if (!lead.business_email) {
      kept.push({ ...lead, email_verification_status: null, email_verified: null, email_verification_reason: null });
      continue;
    }
    const v = verdicts.get(lead.business_email.trim().toLowerCase());
    if (v?.status === "invalid") {
      removed++;
      continue;
    }
    kept.push({
      ...lead,
      email_verification_status: v?.status ?? "unknown",
      email_verified: v?.verified ?? null,
      email_verification_reason: v?.reason ?? null,
    });
  }

  console.log(
    `[verify] ${emails.length} addresses in ${Date.now() - started}ms |`,
    `removed ${removed} undeliverable | paid verifier: ${hasPaidVerifier() ? "on" : "off (DNS only)"}`,
  );
  return { leads: kept, removed };
}

// Plan credit configuration lives in _shared/plan-limits.ts, which the frontend
// reads too — see getPlanSearchLimits. Do not reintroduce a local copy.

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  let supabase: any = null;
  let usageEventId: string | null = null;

  try {
    const filters: ExternalLeadFilters = await req.json();
    console.log('Received filters:', JSON.stringify(filters));

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify user is authenticated
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // The stated ICP, loaded once and used to score every result in this
    // search. Without it the ICP score was a generic seniority table that gave
    // the same answer to every user regardless of who they actually sell to.
    const { data: icpProfile } = await supabase
      .from('icp_profiles')
      .select('industries, company_size_min, company_size_max, seniority_levels, departments, target_titles, geographies, tech_stack')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const icpForScoring = (icpProfile as IcpInput | null) ?? null;
    const mapLead = makeLeadMapper(icpForScoring);

    // CRITICAL: Check if user is admin (bypass all credit checks)
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = adminRole?.role === 'admin';
    console.log('User check:', { userId: user.id, isAdmin });

    // Enforce credit limits for non-admin users.
    // Free accounts get the free allowance — no subscription required.
    // Paid accounts use their monthly allotment. See PLAN_SEARCH_LIMITS.
    //
    // Resolved once, here, and reused for every tier decision in this request
    // (daily limit, credit balance, results per search). Resolving it twice is
    // what let the results cap default to a different plan than the credit
    // check, so a row-less account was metered as free but capped as growth.
    let userPlan = 'free';
    // Whether this request charged a credit, and whether it counted against the
    // daily cap — read by refundCredit below to undo exactly what was consumed.
    let chargesPerSearch = false;
    let creditWasCharged = false;
    let dailyWasCounted = false;
    let creditBalanceAfter: number | null = null;


    if (!isAdmin) {
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('plan, status, account_status, search_credits_remaining, daily_searches_used, daily_searches_reset_at, stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (subError) {
        console.error('Error fetching subscription:', subError);
        throw new Error('Failed to verify subscription');
      }

      // Resolve plan — no subscription row = free tier. Resolved before the
      // audit row is written so every event carries the tier it ran under;
      // grouping spend by tier is the point of the table.
      userPlan = subscription?.plan || 'free';
      const planConfig = getPlanSearchLimits(userPlan);

      // Create the audit row for this search before any gate so failures are recorded.
      usageEventId = await createUsageEvent(supabase, filters, user.id, userPlan, false);

      // Hard-lock only explicitly locked accounts.
      if (subscription?.account_status === 'locked') {
        await updateUsageEvent(supabase, usageEventId, 'error', 0, 'account_locked');
        return new Response(
          JSON.stringify({ error: 'Account is locked. Please contact support.', error_code: 'account_locked', leads: [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check daily limit reset
      const now = new Date();
      const resetAt = subscription?.daily_searches_reset_at ? new Date(subscription.daily_searches_reset_at) : null;
      let dailyUsed = subscription?.daily_searches_used || 0;

      if (!resetAt || now >= resetAt) {
        // Reset daily counter
        dailyUsed = 0;
        const nextReset = new Date();
        nextReset.setHours(24, 0, 0, 0); // Reset at midnight

        await supabase
          .from('subscriptions')
          .update({ 
            daily_searches_used: 0,
            daily_searches_reset_at: nextReset.toISOString()
          })
          .eq('user_id', user.id);
      }

      // Check daily limit
      if (dailyUsed >= planConfig.dailySearchLimit) {
        console.log('Daily limit reached:', { userId: user.id, dailyUsed, limit: planConfig.dailySearchLimit });
        await updateUsageEvent(supabase, usageEventId, 'error', 0, 'daily_limit_reached');
        return new Response(
          JSON.stringify({ 
            error: 'Daily search limit reached. Try again tomorrow.',
            error_code: 'daily_limit_reached',
            daily_used: dailyUsed,
            daily_limit: planConfig.dailySearchLimit,
            leads: [] 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Searching is free on paid plans — a credit is spent when a lead is
      // actually revealed, which enrich-lead charges for. The free tier is the
      // exception: it cannot reveal at all, so metering it per reveal would
      // meter nothing. Its allowance is per search, exactly as the pricing page
      // advertises it ("100 lead searches / month").
      chargesPerSearch = userPlan === 'free';

      const remainingCredits = subscription?.search_credits_remaining ?? planConfig.monthlySearchCredits;
      if (chargesPerSearch && remainingCredits <= 0) {
        console.log('Free search allowance exhausted:', { userId: user.id, remaining: remainingCredits });
        await updateUsageEvent(supabase, usageEventId, 'error', 0, 'credits_exhausted');
        return new Response(
          JSON.stringify({
            error: `You've used your ${planConfig.monthlySearchCredits} free lead searches. `
              + 'Upgrade to a paid plan to keep finding prospects.',
            error_code: 'credits_exhausted',
            upgrade_required: true,
            remaining_credits: remainingCredits,
            leads: [],
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Count the search against the daily limit for every non-admin — that cap
      // is a rate limit, not a charge, and it is what bounds provider spend now
      // that paid searching costs no credits.
      const newDailyUsed = dailyUsed + 1;
      const update: Record<string, unknown> = { daily_searches_used: newDailyUsed };
      const newRemaining = remainingCredits - 1;
      if (chargesPerSearch) {
        update.search_credits_remaining = newRemaining;
        creditBalanceAfter = newRemaining;
      }

      const { error: updateError } = await supabase
        .from('subscriptions')
        .update(update)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating search usage:', updateError);
        throw new Error('Failed to update credits');
      }

      dailyWasCounted = true;

      if (chargesPerSearch) {
        creditWasCharged = true;
        await supabase.from('search_transactions').insert({
          user_id: user.id,
          type: 'usage',
          amount: -1,
          balance_after: newRemaining,
          description: `Lead search: ${filters.job_title || filters.industry || 'general'}`,
        });
      }

      // Update the audit row with the actual credit impact of this search.
      await updateUsageEvent(supabase, usageEventId, 'started', 0, undefined, undefined, undefined, {
        creditsCharged: creditWasCharged ? 1 : 0,
        creditBalanceAfter,
      });

      console.log('Search recorded:', {
        userId: user.id,
        plan: userPlan,
        chargesPerSearch,
        newRemaining: chargesPerSearch ? newRemaining : remainingCredits,
        newDailyUsed,
        dailyLimit: planConfig.dailySearchLimit
      });
    }

    // Ensure admin runs are also audited. Guarded because non-admins already
    // have a row from the block above — running this unconditionally wrote a
    // second row per search and left the first stranded at 'started', which
    // double-counts every search and skews any status breakdown.
    if (!usageEventId) {
      usageEventId = await createUsageEvent(supabase, filters, user.id, userPlan, isAdmin);
    }

    // Undo what this search consumed when it fails or comes back empty. The
    // daily count is always released; the credit only if one was actually
    // charged, which now happens on the free tier alone.
    const refundCredit = async (reason: string) => {
      if (!dailyWasCounted && !creditWasCharged) return;
      const refundingCredit = creditWasCharged;
      dailyWasCounted = false;
      creditWasCharged = false;
      try {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('search_credits_remaining, daily_searches_used')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!sub) return;
        const restored = (sub.search_credits_remaining || 0) + 1;
        const update: Record<string, unknown> = {
          daily_searches_used: Math.max((sub.daily_searches_used || 0) - 1, 0),
        };
        if (refundingCredit) update.search_credits_remaining = restored;
        await supabase
          .from('subscriptions')
          .update(update)
          .eq('user_id', user.id);
        if (refundingCredit) {
          await supabase.from('search_transactions').insert({
            user_id: user.id,
            type: 'refund',
            amount: 1,
            balance_after: restored,
            description: `Refund: ${reason}`,
          });
        }
        console.log('Search usage released:', { userId: user.id, reason, refundingCredit });
      } catch (e) {
        console.error('Failed to release search usage:', e);
      }
    };

    // Get Railway API URL from secrets
    const railwayBaseUrl = Deno.env.get('RAILWAY_LEADS_API_URL');
    if (!railwayBaseUrl) {
      console.error('RAILWAY_LEADS_API_URL not configured');
      await refundCredit('provider_not_configured');
      await updateUsageEvent(supabase, usageEventId, 'error', 0, 'provider_not_configured');
      return new Response(
        JSON.stringify({ error: 'Lead data provider not configured', leads: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure we always hit the /search endpoint, regardless of how the secret is configured
    const baseUrl = railwayBaseUrl.replace(/\/+$/, '').replace(/\/(search|docs|health)$/, '');
    const railwayUrl = `${baseUrl}/search`;
    console.log('Calling Railway API:', railwayUrl);

    // Admin-only schema probe: call with { _probe: true } to retrieve the Railway OpenAPI schema.
    // Useful for diagnosing field name mismatches without touching Supabase logs.
    if ((filters as any)._probe === true && isAdmin) {
      const probeRailwayKey = Deno.env.get('RAILWAY_API_KEY');
      const probeHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (probeRailwayKey) {
        probeHeaders['Authorization'] = `Bearer ${probeRailwayKey}`;
        probeHeaders['X-API-Key'] = probeRailwayKey;
      }
      const endpoints = ['/openapi.json', '/docs', '/'];
      const probeResults: Record<string, any> = {};
      for (const ep of endpoints) {
        try {
          const r = await fetch(`${baseUrl}${ep}`, { headers: probeHeaders });
          const txt = await r.text();
          probeResults[ep] = { status: r.status, body: txt.substring(0, 3000) };
        } catch (e) {
          probeResults[ep] = { error: String(e) };
        }
      }
      return new Response(JSON.stringify({ probe: true, results: probeResults }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Prepare request body for Railway API - PDL format
    // Multi-value ICP filters: fall back to the first entry for the single-value
    // provider fields, and keep the full lists for the fan-out below.
    const icpTitles = strList(filters.job_titles);
    const icpIndustries = strList(filters.industries);
    const icpCountries = strList(filters.countries);
    const icpSeniorities = strList(filters.seniority_levels);
    let jobTitle: string | undefined = filters.job_title || icpTitles[0];

    let nonJobKeywords: string[] = [];
    
    if (filters.keywords && filters.keywords.length > 0) {
      const extracted = extractJobTitleFromKeywords(filters.keywords);
      if (!jobTitle && extracted.jobTitle) {
        jobTitle = extracted.jobTitle;
      }
      nonJobKeywords = extracted.remaining;
      console.log('Extracted job title from keywords:', extracted.jobTitle, 'Remaining keywords:', nonJobKeywords);
    }

    // Build request body with pagination
    // Enforce plan-based maxResultsPerSearch limit
    const page = filters.page || 1;
    
    // Reuse the plan resolved above rather than re-reading the subscription:
    // one lookup, one tier, so the results cap can never disagree with the
    // tier the credit was charged against. Admins get the pro cap.
    const maxResults = getPlanSearchLimits(isAdmin ? 'pro' : userPlan).maxResultsPerSearch;
    
    const limit = Math.min(filters.limit || 10, maxResults);
    const offset = (page - 1) * limit;
    // LinkedIn URLs of people the user already has, sent UPSTREAM so the
    // provider returns different people rather than the same ones again.
    //
    // exclude_seen below filters the response after it arrives, which shrinks
    // the page without changing what the provider chose to put on it. The
    // provider returns its first page for a given filter set every time, so
    // filtering afterwards means a search that used to show ten already-saved
    // leads now shows nothing — and one that shows anything shows the same
    // people it showed last time. Crustdata takes exclusions natively
    // (post_processing.exclude_profiles), so telling it up front is what makes
    // a repeated search return leads nobody has seen.
    //
    // Capped: this travels in the request body on every search, and the leads
    // most likely to come back at the top of a page are the ones saved most
    // recently.
    const seenProfileUrls = async (): Promise<string[]> => {
      if (!filters.exclude_seen) return [];
      const { data } = await supabase
        .from('leads')
        .select('linkedin_url')
        .eq('user_id', user.id)
        .not('linkedin_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);
      const urls = (data ?? [])
        .map((r: any) => String(r.linkedin_url ?? '').trim())
        .filter((u: string) => u.includes('linkedin.com/in/'));
      if (urls.length) console.log(`excluding ${urls.length} already-saved profiles upstream`);
      return urls;
    };
    const excludeProfiles = await seenProfileUrls();

    // Normalize all values
    const normalizedIndustry = normalizeIndustry(filters.industry || icpIndustries[0] || '');
    const normalizedSeniority = normalizeSeniority(filters.seniority || icpSeniorities[0] || '');
    const normalizedCompanySize = normalizeCompanySize(filters.company_size || '');
    const normalizedCountry = normalizeCountry(filters.country || icpCountries[0] || '');


    // Build raw body, we'll strip empty values before sending
    const rawBody: Record<string, any> = {
      // Railway has a first-class semantic parser. Preserve the user's full
      // request instead of requiring every extracted qualifier to occur as a
      // literal keyword. Structured fields remain alongside it as hard bounds.
      query: filters.query?.trim() || undefined,
      job_title: jobTitle || undefined,
      location: normalizedCountry || undefined,
      industry: normalizedIndustry || undefined,
      company: filters.company || undefined,
      company_domain: filters.company_domain || undefined,
      company_size: normalizedCompanySize || undefined,
      seniority: normalizedSeniority || undefined,
      // `query` carries nuanced product/funding/use-case language. Sending the
      // same phrases as `keywords` as well makes them an accidental AND clause.
      keywords: !filters.query && nonJobKeywords.length > 0 ? nonJobKeywords.join(', ') : undefined,
      limit,
      // A cursor supersedes the offset: it is the provider's own position, and
      // sending both would ask for the same rows twice over.
      ...(filters.cursor ? { cursor: filters.cursor } : page > 1 ? { offset } : {}),
      // Ask the provider not to return people the user already has.
      ...(excludeProfiles.length ? { exclude_profiles: excludeProfiles } : {}),
    };

    // CRITICAL: Strip empty/null/undefined values so Railway doesn't build broken PDL queries
    const requestBody: Record<string, any> = Object.fromEntries(
      Object.entries(rawBody).filter(([_, v]) => v !== null && v !== undefined && v !== '')
    );

    // Check if we have at least one search parameter (besides limit/offset)
    const hasSearchParam = requestBody.query || requestBody.job_title || requestBody.location ||
                           requestBody.industry || requestBody.company ||
                           requestBody.company_domain ||
                           requestBody.company_size || requestBody.seniority ||
                           requestBody.keywords;
    
    if (!hasSearchParam) {
      // Defaulting to job_title 'CEO' here meant a query the parser could not
      // read came back as a list of CEOs — leads with no relation to what was
      // typed. Nothing is better than something wrong: say so and let the user
      // rephrase.
      console.warn('No usable search parameters parsed from the query');
      await refundCredit('unparsed_query');
      await updateUsageEvent(supabase, usageEventId, 'error', 0, 'unparsed_query');
      return new Response(
        JSON.stringify({
          error: 'Could not tell what to search for from that description. '
            + 'Name a role and something to narrow it — e.g. "VP of Sales at SaaS companies in the US".',
          error_code: 'unparsed_query',
          leads: [],
          total: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filters dropped by an opt-in broadening retry, reported to the caller so
    // the UI can say the results are wider than what was asked for.
    let relaxedFilters: string[] = [];

    // Set when the marketplace fallback, not the primary provider, produced the
    // results. Without it the usage event credits ColdIQ's leads to the primary
    // and the spend telemetry cannot tell the two apart — which is exactly the
    // number needed to judge whether the fallback is worth its credits.
    let sourcedFromColdIq = false;

    console.log('=== REQUEST TO RAILWAY ===');
    console.log('URL:', railwayUrl);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    // Optional per-request API key (set RAILWAY_API_KEY in Supabase secrets if required)
    const railwayApiKey = Deno.env.get('RAILWAY_API_KEY');
    const railwayHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (railwayApiKey) {
      railwayHeaders['Authorization'] = `Bearer ${railwayApiKey}`;
      railwayHeaders['X-API-Key'] = railwayApiKey;
    }

    // ─── Account-based mode: contacts scoped to a set of target companies ───────
    // The "Target companies" tab sends companies[]. The data source can't OR
    // multiple companies in one query, so we run one /search per company inside
    // this single invocation (one credit total — already deducted above) and merge
    // the results. Per-company misses are reported via empty_companies, not a
    // global error, so other companies still return.
    const targetCompanies = Array.isArray(filters.companies) ? filters.companies : [];

    if (targetCompanies.length > 0) {
      const targets = targetCompanies.slice(0, 10);
      const perCompany = Math.min(Math.max(limit, 10), 25);
      const roleFields: Record<string, any> = {};
      if (jobTitle) roleFields.job_title = jobTitle;
      if (normalizedSeniority) roleFields.seniority = normalizedSeniority;
      if (nonJobKeywords.length > 0) roleFields.keywords = nonJobKeywords.join(', ');

      const collected: any[] = [];
      const emptyCompanies: string[] = [];
      for (const t of targets) {
        const name = typeof t?.name === 'string' ? t.name.trim() : '';
        const domain = typeof t?.domain === 'string' ? t.domain.trim() : '';
        if (!name && !domain) continue;
        const body: Record<string, any> = { ...roleFields, limit: perCompany };
        if (domain) body.company_domain = domain;
        if (name) body.company = name;
        try {
          const r = await fetch(railwayUrl, { method: 'POST', headers: railwayHeaders, body: JSON.stringify(body) });
          if (!r.ok) { emptyCompanies.push(name || domain); continue; }
          const d = await r.json();
          const arr = Array.isArray(d) ? d
            : (d.leads || d.contacts || d.people || d.persons || d.results || d.data || d.items || []);
          if (!Array.isArray(arr) || arr.length === 0) { emptyCompanies.push(name || domain); continue; }
          for (const raw of arr) collected.push(raw);
        } catch (e) {
          console.warn('[companies] search failed for', name || domain, e instanceof Error ? e.message : e);
          emptyCompanies.push(name || domain);
        }
      }

      const mappedLeads: ScoredLead[] = collected
        .map(mapLead)
        .filter((l) => l.contact_name || l.company_name)
        .sort((a, b) => b.scores.overall_score - a.scores.overall_score);

      if (mappedLeads.length === 0) {
        await refundCredit('empty_result');
        await updateUsageEvent(supabase, usageEventId, 'empty', 0, 'empty_result');
        return new Response(
          JSON.stringify({ success: true, leads: [], total: 0, from_cache: false, empty_companies: emptyCompanies,
            message: 'No contacts found at the selected companies. Try broadening the role filter.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify the page being returned, not the whole match set — an address
      // the user never sees is not worth paying to check.
      const { leads: pageLeads, removed: unverifiableCount } =
        await applyVerification(supabase, mappedLeads.slice(offset, offset + limit));
      await updateUsageEvent(supabase, usageEventId, 'success', pageLeads.length, undefined, 'api', mappedLeads.length);
      return new Response(
        JSON.stringify({ success: true, leads: pageLeads, total: mappedLeads.length, from_cache: false,
          empty_companies: emptyCompanies, removed_undeliverable: unverifiableCount }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const icpExcluder = buildIcpExcluder(filters);


    // Drops leads the user already has saved, so repeated searches surface new people.
    const dropSeenLeads = async (input: ScoredLead[]): Promise<ScoredLead[]> => {
      if (!filters.exclude_seen || input.length === 0) return input;
      const { data: seenRows } = await supabase
        .from('leads')
        .select('contact_email, contact_name, company_name')
        .eq('user_id', user.id)
        .limit(5000);
      const seenEmails = new Set(
        (seenRows ?? [])
          .map((r: any) => String(r.contact_email ?? '').trim().toLowerCase())
          .filter(Boolean)
      );
      const seenPairs = new Set(
        (seenRows ?? []).map((r: any) =>
          `${String(r.contact_name ?? '').trim().toLowerCase()}|${String(r.company_name ?? '').trim().toLowerCase()}`
        )
      );
      const out = input.filter((l) => {
        const email = String((l as any).business_email ?? '').trim().toLowerCase();
        if (email && seenEmails.has(email)) return false;
        const pair = `${String(l.contact_name ?? '').trim().toLowerCase()}|${String(l.company_name ?? '').trim().toLowerCase()}`;
        return !seenPairs.has(pair);
      });
      console.log(`exclude_seen: dropped ${input.length - out.length} already-saved leads`);
      return out;
    };

    // ─── Full-ICP fan-out: the provider takes one title/industry per query, so ──
    // run one search per ICP title (x industry), merge, de-dupe and apply the
    // ICP's exclusion lists. This is what makes agent searches match the saved ICP
    // instead of collapsing to the first title only.
    const fanTitles = icpTitles.length > 1 ? icpTitles.slice(0, 4) : [];
    const fanIndustries = icpIndustries.length > 1 ? icpIndustries.slice(0, 2) : [];
    if (fanTitles.length > 1 || (fanTitles.length && fanIndustries.length > 1)) {
      const variants: Array<Record<string, any>> = [];
      const titles = fanTitles.length ? fanTitles : [jobTitle].filter(Boolean) as string[];
      const industriesForFan = fanIndustries.length ? fanIndustries : [filters.industry || icpIndustries[0] || ''];
      for (const t of titles) {
        for (const ind of industriesForFan) {
          const body: Record<string, any> = { ...requestBody, job_title: t };
          const normInd = normalizeIndustry(ind || '');
          if (normInd) body.industry = normInd; else delete body.industry;
          variants.push(body);
        }
      }

      const perVariant = Math.max(5, Math.ceil(limit / Math.max(variants.length, 1)) * 2);
      const collectedIcp: any[] = [];
      for (const body of variants.slice(0, 8)) {
        try {
          const r = await fetch(railwayUrl, {
            method: 'POST',
            headers: railwayHeaders,
            body: JSON.stringify({ ...body, limit: perVariant }),
          });
          if (!r.ok) {
            console.warn('[icp-fanout] variant failed', body.job_title, r.status);
            continue;
          }
          const d = await r.json();
          const arr = Array.isArray(d)
            ? d
            : (d.leads || d.contacts || d.people || d.persons || d.results || d.data || d.items || []);
          if (Array.isArray(arr)) collectedIcp.push(...arr);
        } catch (e) {
          console.warn('[icp-fanout] variant error', body.job_title, e instanceof Error ? e.message : e);
        }
      }

      if (collectedIcp.length > 0) {
        const seen = new Set<string>();
        const dedupedIcp: ScoredLead[] = collectedIcp
          .map(mapLead)
          .filter((l) => l.contact_name || l.company_name)
          .filter((l) => (icpExcluder ? icpExcluder(l) : true))
          .filter((l) => {
            const key = `${(l as any).business_email || ''}|${l.contact_name || ''}|${l.company_name || ''}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .sort((a, b) => b.scores.overall_score - a.scores.overall_score);
        const icpLeads = await dropSeenLeads(dedupedIcp);

        if (icpLeads.length > 0) {
          console.log(`[icp-fanout] ${variants.length} variants → ${icpLeads.length} unique in-ICP leads`);
          await updateUsageEvent(supabase, usageEventId, 'success', icpLeads.length, undefined, 'api', icpLeads.length);
          return new Response(
            JSON.stringify({
              success: true,
              leads: icpLeads.slice(offset, offset + limit),
              total: icpLeads.length,
              from_cache: false,
              icp_fanout: { variants: variants.length, titles },
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      console.warn('[icp-fanout] no results from fan-out, falling back to single search');
    }



    // Call Railway backend
    let response: Response;
    try {
      console.log('Fetching from Railway URL:', railwayUrl);
      response = await fetch(railwayUrl, {
        method: 'POST',
        headers: railwayHeaders,
        body: JSON.stringify(requestBody),
      });
      console.log('Railway response status:', response.status);
      console.log('Railway response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));
    } catch (fetchError) {
      console.error('Fetch to Railway failed entirely:', fetchError);
      await refundCredit('network_error');
      await updateUsageEvent(supabase, usageEventId, 'error', 0, 'network_error');
      return new Response(
        JSON.stringify({ error: 'Could not reach lead data provider.', error_code: 'network_error', leads: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle 402 Payment Required - NO cache fallback (must match search criteria)
    if (response.status === 402) {
      console.log('PDL credits exhausted (402) - returning empty results');
      await refundCredit('provider_credits_exhausted');
      await updateUsageEvent(supabase, usageEventId, 'error', 0, 'credits_exhausted');
      return new Response(
        JSON.stringify({ 
          error: 'Search credits exhausted. Please add more credits to continue searching.',
          error_code: 'credits_exhausted',
          leads: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // On 400, retry once without the specific filter the provider rejected.
    // Common causes: unrecognised location string, unsupported industry / company_size filter field.
    if (response.status === 400) {
      const errBody = await response.text().catch(() => '');
      console.warn('Railway returned 400:', errBody.substring(0, 500));

      const unsupported = /unsupported filter field/i.test(errBody);
      const mentions = (field: string) => errBody.toLowerCase().includes(field);

      // Retry only with the filter the provider actually named, and only when
      // it named one.
      //
      // This used to be a blind ladder: drop location, then industry, then all
      // three at once, and if that emptied the request, substitute
      // `job_title = 'CEO'`. That last step turned a rejected search into an
      // unfiltered global search for CEOs, returned as though it matched the
      // ICP — which is where the aerospace and venture-capital leads came from.
      // A search the provider refused is an error to report, not a different
      // search to run.
      const offending: string[] = [];
      if (unsupported) {
        if (mentions('industry') && requestBody.industry) offending.push('industry');
        if ((mentions('employee_count') || mentions('company_size')) && requestBody.company_size) offending.push('company_size');
        if (mentions('location') && requestBody.location) offending.push('location');
      }

      let recovered = false;
      // An agent search states its ICP exactly; widening it is never a favour.
      if (offending.length && !filters.strict) {
        const retryBody: Record<string, any> = { ...requestBody };
        for (const key of offending) delete retryBody[key];

        // Without something to match on, the "retry" is a different search.
        const stillTargeted = retryBody.job_title || retryBody.seniority ||
          retryBody.keywords || retryBody.company || retryBody.company_domain;

        if (stillTargeted) {
          console.log('Provider rejected', offending.join(', '), '— retrying without it');
          try {
            const retryRes = await fetch(railwayUrl, {
              method: 'POST',
              headers: railwayHeaders,
              body: JSON.stringify(retryBody),
            });
            if (retryRes.ok) {
              response = retryRes;
              recovered = true;
              // Say so: these results are wider than what was asked for.
              relaxedFilters = offending;
            } else {
              console.error('Railway retry failed:', retryRes.status);
            }
          } catch (retryErr) {
            console.error('Railway retry fetch failed:', retryErr);
          }
        }
      }

      if (!recovered) {
        // Don't dress an upstream rejection up as a successful empty search —
        // the user needs to know the provider refused the query (credit refunded).
        await refundCredit('upstream_400');
        await updateUsageEvent(supabase, usageEventId, 'error', 0, 'upstream_rejected');
        // Naming the filter beats "try simpler filters": the user can only fix
        // what they can see, and the provider told us which one it choked on.
        const named = offending.length
          ? ` It could not handle: ${offending.join(', ')}.`
          : '';
        return new Response(
          JSON.stringify({
            error: `The lead data provider rejected this search.${named} Your search credit was not used — adjust that filter and try again.`,
            error_code: 'upstream_rejected',
            rejected_filters: offending,
            leads: [],
            total: 0,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Railway API error:', response.status, errorText);
      await refundCredit(`upstream_${response.status}`);
      await updateUsageEvent(supabase, usageEventId, 'error', 0, 'upstream_unavailable');
      return new Response(
        JSON.stringify({
          error: 'The lead data provider is unavailable right now. Your search credit was not used — please try again shortly.',
          error_code: 'upstream_unavailable',
          leads: [],
          total: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    const rawText = await response.text();
    console.log('=== RAW RESPONSE FROM RAILWAY ===');
    console.log('Response status:', response.status);
    console.log('Raw response body (first 3000 chars):', rawText.substring(0, 3000));
    
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('Failed to parse Railway response as JSON:', parseErr);
      await refundCredit('invalid_provider_response');
      await updateUsageEvent(supabase, usageEventId, 'error', 0, 'invalid_provider_response');
      return new Response(
        JSON.stringify({ error: 'Invalid response from lead provider.', leads: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    console.log('Response data keys:', Object.keys(data));
    console.log('from_cache:', data.from_cache);
    console.log('source:', data.source);
    console.log('count:', data.count);
    console.log('Full response data:', JSON.stringify(data, null, 2).substring(0, 2000));

    // Handle many response formats — Railway may use any of these keys
    let rawLeads: any[] = [];
    const LEAD_ARRAY_KEYS = ['leads', 'contacts', 'people', 'persons', 'results', 'data', 'items', 'records', 'email_list'];
    if (Array.isArray(data)) {
      console.log('Data is direct array format');
      rawLeads = data;
    } else {
      for (const key of LEAD_ARRAY_KEYS) {
        if (data[key] && Array.isArray(data[key]) && data[key].length > 0) {
          console.log(`Using data.${key} array from Railway response`);
          rawLeads = data[key];
          break;
        }
      }
    }

    console.log('=== LEAD DATA ===');
    console.log('Raw leads count:', rawLeads.length);
    if (rawLeads.length > 0) {
      console.log('First raw lead:', JSON.stringify(rawLeads[0], null, 2));
    }

    // Progressive fallback: if full search returned 0, retry with progressively fewer filters.
    // This handles cases where the job title exists in the DB but not under that industry/location.
    const parseLeadsFromData = (d: any): any[] => {
      if (Array.isArray(d)) return d;
      const KEYS = ['leads', 'contacts', 'people', 'persons', 'results', 'data', 'items', 'records', 'email_list'];
      for (const k of KEYS) {
        if (d[k] && Array.isArray(d[k]) && d[k].length > 0) return d[k];
      }
      return [];
    };

    // Progressive broadening when the exact search finds nothing.
    //
    // The provider's industry taxonomy rarely matches what a user types: an
    // otherwise 1.4M-result search for "Founder in the United States" collapses
    // to 2 results with industry="computer software", and to 0 once company_size
    // is added. Returning "no leads found" there is wrong — the ICP exists, the
    // secondary filters just don't resolve upstream.
    //
    // Broadening is opt-in, and the ladder below only runs when the user asks
    // for it.
    //
    // It used to run on every non-agent search, which contradicted the contract
    // `relax` already documented ("off by default ... the UI sets this only
    // when the user explicitly asks to broaden"). The effect in production: a
    // search for founders at AI SaaS companies found nothing, dropped
    // `industry`, then dropped `seniority`, and answered with whoever matched
    // `title contains "founder"` and a headcount band. Those people came back
    // for every differently-worded search, because by the last rung every
    // search had become the same one.
    //
    // A search that matches nothing should say so. The filters are what the
    // user asked for, and quietly answering a different question makes the
    // result look like the ICP is wrong rather than the search being empty.
    const DROP_LADDER: string[][] = [
      ['keywords'],
      ['keywords', 'industry'],
      ['keywords', 'industry', 'seniority'],
      ['keywords', 'industry', 'seniority', 'company_size'],
    ];


    // `keywords` leads the ladder because it was historically a junk drawer.
    // It is now where a term no taxonomy can express travels — "AI SaaS" sends
    // industry=computer software *and* keywords="ai saas", because the industry
    // value on its own is every software company there is. Dropping the keyword
    // then leaves exactly the over-broad search this was meant to stop.
    const keywordIsDefining = semanticTermsIn(String(requestBody.keywords ?? '')).length > 0;

    // `relax` is the user pressing "broaden this". `strict` is an agent search,
    // which states its ICP exactly and must never be widened.
    if (filters.relax && !filters.strict && rawLeads.length === 0) {
      for (const plan of DROP_LADDER) {
        const applicable = plan.filter((k) => requestBody[k] !== undefined && requestBody[k] !== null)
          .filter((k) => !(k === 'keywords' && keywordIsDefining));
        if (applicable.length === 0) continue;

        const relaxed: Record<string, any> = { ...requestBody };
        for (const k of applicable) delete relaxed[k];

        // Never fire a search with nothing meaningful left to match on.
        if (!relaxed.job_title && !relaxed.seniority && !relaxed.company && !relaxed.company_domain) continue;

        console.log(`0 results — broadening by dropping ${applicable.join(', ')}:`, JSON.stringify(relaxed));
        try {
          const r = await fetch(railwayUrl, { method: 'POST', headers: railwayHeaders, body: JSON.stringify(relaxed) });
          if (!r.ok) {
            console.error('Broadening retry failed with status', r.status);
            continue;
          }
          const d = await r.json();
          const found = parseLeadsFromData(d);
          console.log(`Broadening retry returned ${found.length} leads (source: ${d?.source})`);
          if (found.length > 0) {
            rawLeads = found;
            relaxedFilters = applicable;
            break;
          }
        } catch (e) {
          console.log('Broadening retry failed:', e);
        }
      }
    }


    // ─── Last resort: the marketplace, before giving the user an empty page ───
    //
    // The credit is already spent by this point and every retry above has come
    // back empty, so the choice is between one marketplace call and showing
    // nothing for a search the user paid for. Costs credits, so it is the only
    // circumstance in which it runs.
    //
    // The verb anchors on job titles, seniorities, locations and keywords; it
    // has no free-text query, so a search that parsed into none of those has
    // nothing to send and is skipped rather than fired blind.
    if (rawLeads.length === 0 && coldiqConfigured() && coldiqLeadsMode() === "fallback") {
      const cq = {
        job_titles: strList(filters.job_titles).length ? strList(filters.job_titles)
          : (requestBody.job_title ? [String(requestBody.job_title)] : []),
        seniorities: strList(filters.seniority_levels).length ? strList(filters.seniority_levels)
          : (requestBody.seniority ? [String(requestBody.seniority)] : []),
        locations: strList(filters.countries).length ? strList(filters.countries)
          : (requestBody.location ? [String(requestBody.location)] : []),
        keywords: strList(filters.keywords),
        company_domains: [
          ...(Array.isArray(filters.companies)
            ? filters.companies.map((c: any) => String(c?.domain ?? '').trim()).filter(Boolean)
            : []),
          ...(requestBody.company_domain ? [String(requestBody.company_domain)] : []),
        ],
        limit: Math.min(limit, 100),
      };

      const hasAnchor = cq.job_titles.length || cq.seniorities.length ||
        cq.keywords.length || cq.company_domains.length;

      if (!hasAnchor) {
        console.log('[coldiq] skipped — nothing to anchor a people search on');
      } else {
        console.log('[coldiq] primary returned 0, trying marketplace fallback');
        const { records, error: cqErr } = await coldiqSearchPeople(cq);
        if (cqErr) {
          console.error('[coldiq] fallback failed:', cqErr);
        } else if (records.length > 0) {
          sourcedFromColdIq = true;
          // Through the same mapper as every other provider: it resolves field
          // names across conventions, so a normalized marketplace record needs
          // no parallel mapping path to maintain.
          rawLeads = records;
          console.log(`[coldiq] fallback returned ${records.length} record(s)`);
        }
      }
    }

    // If all retries exhausted, log schema for diagnosis and refund.
    if (rawLeads.length === 0) {
      console.log('All retries returned 0 leads — fetching Railway schema for diagnosis...');
      try {
        const schemaRes = await fetch(`${baseUrl}/openapi.json`, { headers: railwayHeaders });
        if (schemaRes.ok) {
          const schema = await schemaRes.json();
          console.log('=== RAILWAY OPENAPI SCHEMA ===');
          console.log(JSON.stringify(schema, null, 2).substring(0, 8000));
        } else {
          console.log('Schema not available:', schemaRes.status);
          const rootRes = await fetch(baseUrl, { headers: railwayHeaders });
          console.log('Root endpoint:', rootRes.status, (await rootRes.text()).substring(0, 500));
        }
      } catch (probeErr) { console.log('Schema probe failed:', probeErr); }

      await refundCredit('empty_result');
      await updateUsageEvent(supabase, usageEventId, 'empty', 0, 'empty_result');

      // Name what was searched. "Try different search criteria" is not
      // actionable when the user cannot see which criteria were sent — and now
      // that nothing is dropped silently, the applied filters are the whole
      // explanation for an empty result.
      const applied = Object.entries(requestBody)
        .filter(([k]) => !['limit', 'offset', 'cursor', 'exclude_profiles'].includes(k))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`);

      return new Response(
        JSON.stringify({
          success: true, leads: [], total: 0, from_cache: false,
          applied_filters: applied,
          // The UI offers a broaden action, which re-runs with relax: true and
          // reports back whatever it dropped in relaxed_filters.
          can_broaden: !filters.relax && !filters.strict,
          message: applied.length
            ? `No leads match all of: ${applied.join(' · ')}. Nothing broader was searched — `
              + 'results that stopped matching your description are worse than none. '
              + 'Loosen a filter, or broaden this search to see what a wider version returns.'
            : 'No leads found for this search. Try different search criteria.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map leads to expected format
    const mapped: ScoredLead[] = rawLeads
      .map(mapLead)
      .filter(lead => lead.contact_name || lead.company_name)
      .filter(lead => (icpExcluder ? icpExcluder(lead) : true))
      .sort((a, b) => b.scores.overall_score - a.scores.overall_score);

    const deduped = await dropSeenLeads(mapped);
    // Last step before the response: confirmed-dead addresses never reach the UI.
    const { leads, removed: removedUndeliverable } = await applyVerification(supabase, deduped);


    console.log('Processed leads count:', leads.length);
    if (leads.length > 0) {
      console.log('First processed lead:', JSON.stringify(leads[0], null, 2));
    }

    // `provider` names the providers that contributed, joined ("bytemine+crustdata"),
    // and provider_attempts carries the per-provider counts behind it. Recording
    // data.source here instead only ever said "api", which does not distinguish
    // one provider from three.
    await updateUsageEvent(
      supabase, usageEventId, 'success', leads.length, undefined,
      sourcedFromColdIq ? 'coldiq' : (data.provider || data.source || 'api'),
      data.total || leads.length,
      undefined, data.provider_attempts ?? null,
    );
    return new Response(
      JSON.stringify({ 
        success: true,
        leads,
        total: data.total || leads.length,
        from_cache: data.from_cache || false,
        // What was actually sent upstream. Without this a dropped or rewritten
        // filter is invisible, and the user has no way to tell why the leads do
        // not look like their ICP.
        // Echoed back so the caller can ask for the page after this one. Absent
        // when the provider has no more rows, which is how the UI knows it has
        // reached the end rather than guessing from a total.
        next_cursor: data.next_cursor ?? null,
        applied_filters: requestBody,
        relaxed_filters: relaxedFilters,
        // How many results were dropped as confirmed-undeliverable, so the UI
        // can explain a short page instead of silently returning fewer leads.
        removed_undeliverable: removedUndeliverable,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-external-leads:', error);
    
    // Return generic error message, log details server-side only
    const isAuthError = error instanceof Error && error.message === 'Invalid user token';
    const clientMessage = isAuthError 
      ? 'Authentication required. Please sign in again.'
      : 'Failed to fetch leads. Please try again.';
    const finalErrorCode = isAuthError ? 'auth_error' : 'fetch_error';
    await updateUsageEvent(supabase, usageEventId, 'error', 0, finalErrorCode);
    
    return new Response(
      JSON.stringify({ 
        error: clientMessage,
        error_code: finalErrorCode,
        leads: [] 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: isAuthError ? 401 : 500 
      }
    );
  }
});
