import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExternalLeadFilters {
  job_title?: string;
  industry?: string;
  company_size?: string;
  country?: string;
  company?: string;
  seniority?: string;
  keywords?: string[];
  limit?: number;
  page?: number;
}

interface LeadScores {
  icp_score: number;
  intent_score: number;
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
  scores: LeadScores;
  score_explanation: string;
  buying_signals: string[];
}

// Industry normalization map (user-friendly → PDL canonical)
const INDUSTRY_MAP: Record<string, string> = {
  'law': 'legal services', 'legal': 'legal services', 'legal services': 'legal services',
  'ai': 'computer software', 'ai/ml': 'computer software', 'machine learning': 'computer software',
  'saas': 'computer software', 'software': 'computer software', 'tech': 'information technology and services',
  'fintech': 'financial services', 'finance': 'financial services', 'banking': 'banking',
  'healthcare': 'hospital & health care', 'health': 'hospital & health care', 'medical': 'hospital & health care',
  'marketing': 'marketing and advertising', 'advertising': 'marketing and advertising',
  'real estate': 'real estate', 'realestate': 'real estate',
  'education': 'education management', 'edtech': 'education management',
  'crypto': 'information technology and services', 'web3': 'information technology and services', 'blockchain': 'information technology and services',
  'e-commerce': 'internet', 'ecommerce': 'internet',
  'consulting': 'management consulting',
  'recruiting': 'staffing and recruiting', 'staffing': 'staffing and recruiting', 'hr': 'staffing and recruiting',
  'insurance': 'insurance',
  'construction': 'construction',
  'automotive': 'automotive',
  'food': 'food & beverages', 'restaurant': 'food & beverages',
  'media': 'media production', 'entertainment': 'media production',
  'telecom': 'telecommunications', 'telecommunications': 'telecommunications',
  'logistics': 'logistics and supply chain', 'supply chain': 'logistics and supply chain',
  'manufacturing': 'manufacturing',
  'retail': 'retail',
  'energy': 'oil & energy', 'oil': 'oil & energy',
  'government': 'government administration',
  'nonprofit': 'nonprofit organization management', 'ngo': 'nonprofit organization management',
};

// Country name → ISO 2-letter code map
const COUNTRY_MAP: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'us': 'US', 'u.s.': 'US', 'u.s.a.': 'US', 'america': 'US',
  // US cities/states → country code (location filter will be dropped if Railway doesn't understand city)
  'new york': 'US', 'california': 'US', 'san francisco': 'US', 'silicon valley': 'US',
  'los angeles': 'US', 'chicago': 'US', 'austin': 'US', 'boston': 'US', 'seattle': 'US',
  'miami': 'US', 'denver': 'US', 'atlanta': 'US', 'dallas': 'US', 'houston': 'US',
  'new york city': 'US', 'nyc': 'US', 'sf': 'US', 'la': 'US',
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB', 'britain': 'GB',
  'london': 'GB', 'manchester': 'GB', 'edinburgh': 'GB',
  'canada': 'CA', 'toronto': 'CA', 'vancouver': 'CA', 'montreal': 'CA',
  'australia': 'AU', 'sydney': 'AU', 'melbourne': 'AU',
  'germany': 'DE', 'berlin': 'DE', 'munich': 'DE', 'hamburg': 'DE',
  'france': 'FR', 'paris': 'FR', 'spain': 'ES', 'madrid': 'ES', 'barcelona': 'ES',
  'italy': 'IT', 'rome': 'IT', 'milan': 'IT',
  'netherlands': 'NL', 'amsterdam': 'NL', 'sweden': 'SE', 'stockholm': 'SE',
  'norway': 'NO', 'denmark': 'DK', 'copenhagen': 'DK',
  'switzerland': 'CH', 'zurich': 'CH', 'austria': 'AT', 'vienna': 'AT',
  'belgium': 'BE', 'brussels': 'BE', 'ireland': 'IE', 'dublin': 'IE',
  'india': 'IN', 'bangalore': 'IN', 'mumbai': 'IN', 'delhi': 'IN', 'hyderabad': 'IN',
  'singapore': 'SG', 'israel': 'IL', 'tel aviv': 'IL',
  'brazil': 'BR', 'são paulo': 'BR', 'sao paulo': 'BR', 'rio de janeiro': 'BR',
  'mexico': 'MX', 'mexico city': 'MX',
  'argentina': 'AR', 'buenos aires': 'AR', 'colombia': 'CO', 'bogota': 'CO',
  'chile': 'CL', 'santiago': 'CL',
  'japan': 'JP', 'tokyo': 'JP', 'osaka': 'JP',
  'south korea': 'KR', 'korea': 'KR', 'seoul': 'KR',
  'china': 'CN', 'beijing': 'CN', 'shanghai': 'CN', 'taiwan': 'TW', 'taipei': 'TW',
  'new zealand': 'NZ', 'auckland': 'NZ',
  'south africa': 'ZA', 'cape town': 'ZA', 'johannesburg': 'ZA',
  'nigeria': 'NG', 'lagos': 'NG', 'kenya': 'KE', 'nairobi': 'KE',
  'poland': 'PL', 'warsaw': 'PL', 'portugal': 'PT', 'lisbon': 'PT',
  'czech republic': 'CZ', 'czechia': 'CZ', 'prague': 'CZ',
  'finland': 'FI', 'helsinki': 'FI', 'romania': 'RO', 'bucharest': 'RO',
  'hungary': 'HU', 'budapest': 'HU', 'ukraine': 'UA', 'kyiv': 'UA',
  'uae': 'AE', 'united arab emirates': 'AE', 'dubai': 'AE', 'abu dhabi': 'AE',
  'saudi arabia': 'SA', 'riyadh': 'SA', 'turkey': 'TR', 'istanbul': 'TR',
  'russia': 'RU', 'moscow': 'RU',
};

function normalizeCountry(raw: string): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  return COUNTRY_MAP[lower] || raw.trim();
}

// Seniority normalization map
const SENIORITY_MAP: Record<string, string> = {
  'c-suite': 'cxo', 'c-level': 'cxo', 'executive': 'cxo', 'csuite': 'cxo', 'clevel': 'cxo',
  'vp': 'vp', 'vice president': 'vp',
  'director': 'director',
  'manager': 'manager',
  'senior': 'senior',
  'entry': 'entry', 'junior': 'entry',
  'owner': 'owner',
  'partner': 'partner',
};

// Company size normalization to PDL ranges
const COMPANY_SIZE_MAP: Record<string, string> = {
  '1-10': '1-10', 'micro': '1-10',
  '11-50': '11-50', 'small': '11-50',
  '51-200': '51-200', 'medium': '51-200',
  '201-500': '201-500',
  '501-1000': '501-1000', 'large': '501-1000',
  '1001-5000': '1001-5000',
  '5001-10000': '5001-10000', 'enterprise': '5001-10000',
  '10001+': '10001+', 'mega': '10001+',
};

// Normalize industry value to PDL-compatible format
function normalizeIndustry(raw: string): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  // Check exact match first
  if (INDUSTRY_MAP[lower]) return INDUSTRY_MAP[lower];
  // Check if any key is contained in the input
  for (const [key, value] of Object.entries(INDUSTRY_MAP)) {
    if (lower.includes(key)) return value;
  }
  // If no match, pass through as-is (Railway/PDL may still match it)
  return raw.trim();
}

// Normalize seniority value to PDL-compatible format
function normalizeSeniority(raw: string): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  return SENIORITY_MAP[lower] || raw.trim();
}

// Normalize company size to PDL range format
function normalizeCompanySize(raw: string): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  if (COMPANY_SIZE_MAP[lower]) return COMPANY_SIZE_MAP[lower];
  // Try to match numeric patterns like "201-500" already in correct format
  if (/^\d+[-–]\d+$/.test(raw.trim()) || /^\d+\+$/.test(raw.trim())) return raw.trim();
  return raw.trim();
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

// Calculate scores with per-lead variation using multiple signals
function calculateScores(lead: any): LeadScores {
  // Create a unique seed from lead-specific data for deterministic variation
  const seedStr = `${lead.contact_name || ''}|${lead.company_name || ''}|${lead.company_domain || ''}|${lead.job_title || ''}`;
  const seed = hashString(seedStr);
  // Small deterministic offset (-5 to +5) unique per lead
  const variation = (seed % 11) - 5;

  let icpScore = 40;
  let intentScore = 35;
  let enrichmentScore = 30;

  // === ICP SCORING (job title depth) ===
  const jobTitle = (lead.job_title || '').toLowerCase();
  const jobTitleWords = jobTitle.split(/[\s,/]+/).filter(Boolean);
  
  // Seniority-based scoring with more granularity
  if (jobTitle.includes('ceo') || jobTitle.includes('chief executive')) {
    icpScore += 38;
  } else if (jobTitle.includes('founder') || jobTitle.includes('co-founder')) {
    icpScore += 35;
  } else if (jobTitle.includes('owner') || jobTitle.includes('president')) {
    icpScore += 32;
  } else if (jobTitle.includes('cto') || jobTitle.includes('chief technology')) {
    icpScore += 30;
  } else if (jobTitle.includes('cfo') || jobTitle.includes('chief financial')) {
    icpScore += 28;
  } else if (jobTitle.includes('coo') || jobTitle.includes('cmo') || jobTitle.includes('cro') || jobTitle.includes('cio')) {
    icpScore += 26;
  } else if (jobTitle.includes('vp') || jobTitle.includes('vice president')) {
    icpScore += 22;
  } else if (jobTitle.includes('director')) {
    icpScore += 18;
  } else if (jobTitle.includes('head of') || jobTitle.includes('head,')) {
    icpScore += 16;
  } else if (jobTitle.includes('senior') && (jobTitle.includes('manager') || jobTitle.includes('lead'))) {
    icpScore += 14;
  } else if (jobTitle.includes('manager')) {
    icpScore += 10;
  } else if (jobTitle.includes('lead') || jobTitle.includes('principal')) {
    icpScore += 8;
  } else if (jobTitle.includes('senior')) {
    icpScore += 6;
  } else if (jobTitle.includes('specialist') || jobTitle.includes('analyst') || jobTitle.includes('coordinator')) {
    icpScore += 2;
  }

  // Bonus for revenue/growth/sales-related titles (high buying intent)
  if (jobTitle.includes('revenue') || jobTitle.includes('growth') || jobTitle.includes('sales') || jobTitle.includes('business development')) {
    intentScore += 15;
  }
  if (jobTitle.includes('marketing') || jobTitle.includes('demand gen') || jobTitle.includes('partnerships')) {
    intentScore += 10;
  }
  if (jobTitle.includes('operations') || jobTitle.includes('strategy')) {
    intentScore += 7;
  }

  // Title word count bonus (more specific titles = better data)
  if (jobTitleWords.length >= 4) {
    enrichmentScore += 3;
  }

  // === COMPANY SIZE SCORING ===
  const companySize = (lead.company_size || lead.employee_count || '').toString();
  if (companySize.includes('10001') || companySize.includes('5001')) {
    icpScore += 6;
    intentScore += 12;
  } else if (companySize.includes('1001') || companySize.includes('501')) {
    icpScore += 10;
    intentScore += 14;
  } else if (companySize.includes('201') || companySize.includes('500')) {
    icpScore += 12;
    intentScore += 10;
  } else if (companySize.includes('51') || companySize.includes('200')) {
    icpScore += 8;
    intentScore += 8;
  } else if (companySize.includes('11') || companySize.includes('50')) {
    icpScore += 4;
    intentScore += 4;
  } else if (companySize.includes('1-10') || companySize.includes('micro')) {
    icpScore += 2;
    intentScore += 2;
  }

  // === INDUSTRY SCORING ===
  const industry = (lead.industry || '').toLowerCase();
  // High-value industries for SaaS
  if (industry.includes('software') || industry.includes('technology') || industry.includes('information technology')) {
    intentScore += 8;
  } else if (industry.includes('financial') || industry.includes('banking') || industry.includes('insurance')) {
    intentScore += 7;
  } else if (industry.includes('consulting') || industry.includes('marketing')) {
    intentScore += 6;
  } else if (industry.includes('health') || industry.includes('education')) {
    intentScore += 4;
  } else if (industry.includes('retail') || industry.includes('manufacturing')) {
    intentScore += 3;
  } else if (industry) {
    intentScore += 2; // Any known industry is better than none
  }

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

  // === APPLY PER-LEAD VARIATION ===
  icpScore += variation;
  intentScore += (seed % 7) - 3; // different variation axis
  enrichmentScore += ((seed >> 3) % 5) - 2; // yet another axis

  // Cap scores at 0-100
  icpScore = Math.max(5, Math.min(100, icpScore));
  intentScore = Math.max(5, Math.min(100, intentScore));
  enrichmentScore = Math.max(5, Math.min(100, enrichmentScore));

  const overallScore = Math.round((icpScore * 0.4) + (intentScore * 0.3) + (enrichmentScore * 0.3));

  return {
    icp_score: icpScore,
    intent_score: intentScore,
    enrichment_score: enrichmentScore,
    overall_score: Math.max(5, Math.min(100, overallScore)),
  };
}

// Generate score explanation with specifics
function generateScoreExplanation(lead: any, scores: LeadScores): string {
  const parts: string[] = [];
  
  if (scores.icp_score >= 85) {
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

  if (scores.intent_score >= 60) {
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
function mapRailwayLead(lead: any): ScoredLead {
  // Resolve field names across common API conventions
  const firstName = lead.first_name || lead.firstName || '';
  const lastName = lead.last_name || lead.lastName || '';
  const fullNameFromParts = (firstName && lastName) ? `${firstName} ${lastName}` : (firstName || lastName);

  const jobTitle = lead.job_title || lead.title || lead.position || lead.job_title_levels || lead.role || '';
  const companyName = lead.company_name || lead.company || lead.organization || lead.employer || lead.company_display_name || '';
  const companyDomain = lead.company_domain || lead.domain || lead.company_website || lead.website || '';
  const businessEmail = lead.business_email || lead.email || lead.work_email || lead.contact_email || null;
  const contactName = lead.contact_name || lead.full_name || lead.name || fullNameFromParts || '';
  const industry = lead.industry || lead.company_industry || lead.sector || lead.vertical || '';
  const companySize = lead.company_size || lead.employee_count || lead.employees ||
    lead.company_employee_count || lead.size || lead.employee_range || '';
  const country = lead.country || lead.location_country || lead.country_code ||
    lead.location || lead.geo_country || '';
  const linkedinUrl = lead.linkedin_url || lead.linkedin || lead.linkedin_profile ||
    lead.profile_url || lead.linkedinUrl || null;

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
  };

  const scores = calculateScores(normalised);

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
      const leads = data.leads.map(mapRailwayLead);
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

// Plan credit configuration - must match stripe-config.ts
const PLAN_CREDITS = {
  free: { monthlyCredits: 0, dailyLimit: 0, maxResultsPerSearch: 0 },
  starter: { monthlyCredits: 1000, dailyLimit: 100, maxResultsPerSearch: 25 },
  growth: { monthlyCredits: 2500, dailyLimit: 250, maxResultsPerSearch: 50 },
  pro: { monthlyCredits: 5000, dailyLimit: 500, maxResultsPerSearch: 100 },
  agency: { monthlyCredits: 15000, dailyLimit: 1500, maxResultsPerSearch: 200 },
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // CRITICAL: Check if user is admin (bypass all credit checks)
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = adminRole?.role === 'admin';
    console.log('User check:', { userId: user.id, isAdmin });

    // CRITICAL: Enforce subscription and credit limits (unless admin)
    if (!isAdmin) {
      // Get user's subscription
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .select('plan, status, account_status, search_credits_remaining, daily_searches_used, daily_searches_reset_at, stripe_subscription_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (subError) {
        console.error('Error fetching subscription:', subError);
        throw new Error('Failed to verify subscription');
      }

      // Check if user has an active paid subscription
      if (!subscription || subscription.status !== 'active') {
        console.log('User has no active subscription:', { userId: user.id });
        return new Response(
          JSON.stringify({ 
            error: 'Active subscription required',
            error_code: 'no_subscription',
            leads: [] 
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // CRITICAL: Block free-tier users from lead search entirely
      if (subscription.plan === 'free') {
        console.log('Free tier user blocked from lead search:', { userId: user.id });
        return new Response(
          JSON.stringify({ 
            error: 'Lead search requires a paid plan. Upgrade to Growth ($49/mo) to unlock AI-powered lead discovery.',
            error_code: 'free_tier_blocked',
            upgrade_plan: 'growth',
            leads: [] 
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check if account is locked
      if (subscription.account_status === 'locked') {
        console.log('User account is locked:', { userId: user.id });
        return new Response(
          JSON.stringify({ 
            error: 'Account is locked. Please contact support.',
            error_code: 'account_locked',
            leads: [] 
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // IMPORTANT: Check if user is on a trial without Stripe subscription (trial users can't access leads)
      if (subscription.account_status === 'trial' && !subscription.stripe_subscription_id) {
        console.log('Trial user attempting lead search:', { userId: user.id });
        return new Response(
          JSON.stringify({ 
            error: 'Lead generation requires a paid subscription',
            error_code: 'trial_access_denied',
            leads: [] 
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get plan limits
      const plan = subscription.plan as keyof typeof PLAN_CREDITS;
      const planConfig = PLAN_CREDITS[plan] || PLAN_CREDITS.growth;

      // Check daily limit reset
      const now = new Date();
      const resetAt = subscription.daily_searches_reset_at ? new Date(subscription.daily_searches_reset_at) : null;
      let dailyUsed = subscription.daily_searches_used || 0;

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
      if (dailyUsed >= planConfig.dailyLimit) {
        console.log('Daily limit reached:', { userId: user.id, dailyUsed, limit: planConfig.dailyLimit });
        return new Response(
          JSON.stringify({ 
            error: 'Daily search limit reached. Try again tomorrow.',
            error_code: 'daily_limit_reached',
            daily_used: dailyUsed,
            daily_limit: planConfig.dailyLimit,
            leads: [] 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check monthly credits
      const remainingCredits = subscription.search_credits_remaining || 0;
      if (remainingCredits <= 0) {
        console.log('Monthly credits exhausted:', { userId: user.id, remaining: remainingCredits });
        return new Response(
          JSON.stringify({ 
            error: 'Monthly search credits exhausted. Add more credits or wait for reset.',
            error_code: 'credits_exhausted',
            remaining_credits: remainingCredits,
            leads: [] 
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Deduct credit and increment daily usage BEFORE making external call
      const newRemaining = remainingCredits - 1;
      const newDailyUsed = dailyUsed + 1;

      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          search_credits_remaining: newRemaining,
          daily_searches_used: newDailyUsed,
        })
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating credits:', updateError);
        throw new Error('Failed to update credits');
      }

      // Log the transaction
      await supabase.from('search_transactions').insert({
        user_id: user.id,
        type: 'usage',
        amount: -1,
        balance_after: newRemaining,
        description: `Lead search: ${filters.job_title || filters.industry || 'general'}`,
      });

      console.log('Credit deducted:', { 
        userId: user.id, 
        plan,
        newRemaining, 
        newDailyUsed, 
        dailyLimit: planConfig.dailyLimit 
      });
    }

    // Track whether we already deducted a credit so we can refund on failure
    // or on empty result sets. Admins skip the credit path entirely.
    let creditWasDeducted = !isAdmin;
    const refundCredit = async (reason: string) => {
      if (!creditWasDeducted) return;
      creditWasDeducted = false;
      try {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('search_credits_remaining, daily_searches_used')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!sub) return;
        await supabase
          .from('subscriptions')
          .update({
            search_credits_remaining: (sub.search_credits_remaining || 0) + 1,
            daily_searches_used: Math.max((sub.daily_searches_used || 0) - 1, 0),
          })
          .eq('user_id', user.id);
        await supabase.from('search_transactions').insert({
          user_id: user.id,
          type: 'refund',
          amount: 1,
          balance_after: (sub.search_credits_remaining || 0) + 1,
          description: `Refund: ${reason}`,
        });
        console.log('Credit refunded:', { userId: user.id, reason });
      } catch (e) {
        console.error('Failed to refund credit:', e);
      }
    };

    // Get Railway API URL from secrets
    const railwayBaseUrl = Deno.env.get('RAILWAY_LEADS_API_URL');
    if (!railwayBaseUrl) {
      console.error('RAILWAY_LEADS_API_URL not configured');
      await refundCredit('provider_not_configured');
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
    let jobTitle: string | undefined = filters.job_title;
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
    
    // Get plan config for results-per-search enforcement (admins get pro limits)
    const userPlanConfig = isAdmin ? PLAN_CREDITS.pro : PLAN_CREDITS[(filters as any)._plan as keyof typeof PLAN_CREDITS] || PLAN_CREDITS.growth;
    
    // Look up actual plan from subscription if not admin
    let maxResults = 100; // default for admin
    if (!isAdmin) {
      const { data: subForLimits } = await supabase
        .from('subscriptions')
        .select('plan')
        .eq('user_id', user.id)
        .maybeSingle();
      const planKey = (subForLimits?.plan || 'growth') as keyof typeof PLAN_CREDITS;
      maxResults = PLAN_CREDITS[planKey]?.maxResultsPerSearch || 25;
    }
    
    const limit = Math.min(filters.limit || 10, maxResults);
    const offset = (page - 1) * limit;

    // Normalize all values
    const normalizedIndustry = normalizeIndustry(filters.industry || '');
    const normalizedSeniority = normalizeSeniority(filters.seniority || '');
    const normalizedCompanySize = normalizeCompanySize(filters.company_size || '');
    const normalizedCountry = normalizeCountry(filters.country || '');

    // Build raw body, we'll strip empty values before sending
    const rawBody: Record<string, any> = {
      job_title: jobTitle || undefined,
      location: normalizedCountry || undefined,
      industry: normalizedIndustry || undefined,
      company: filters.company || undefined,
      company_size: normalizedCompanySize || undefined,
      seniority: normalizedSeniority || undefined,
      keywords: nonJobKeywords.length > 0 ? nonJobKeywords.join(', ') : undefined,
      limit,
      ...(page > 1 ? { offset } : {}),
    };

    // CRITICAL: Strip empty/null/undefined values so Railway doesn't build broken PDL queries
    const requestBody: Record<string, any> = Object.fromEntries(
      Object.entries(rawBody).filter(([_, v]) => v !== null && v !== undefined && v !== '')
    );

    // Check if we have at least one search parameter (besides limit/offset)
    const hasSearchParam = requestBody.job_title || requestBody.location || 
                           requestBody.industry || requestBody.company || 
                           requestBody.company_size || requestBody.seniority ||
                           requestBody.keywords;
    
    if (!hasSearchParam) {
      console.warn('No search parameters provided, adding default job_title');
      requestBody.job_title = 'CEO OR Founder OR CTO OR Director';
    }

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
      return new Response(
        JSON.stringify({ error: 'Could not reach lead data provider.', error_code: 'network_error', leads: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle 402 Payment Required - NO cache fallback (must match search criteria)
    if (response.status === 402) {
      console.log('PDL credits exhausted (402) - returning empty results');
      await refundCredit('provider_credits_exhausted');
      return new Response(
        JSON.stringify({ 
          error: 'Search credits exhausted. Please add more credits to continue searching.',
          error_code: 'credits_exhausted',
          leads: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // On 400, retry without location filter (common cause: unrecognised location string)
    if (response.status === 400 && requestBody.location) {
      console.warn('Railway returned 400 with location, retrying without location');
      const retryBody = { ...requestBody };
      delete retryBody.location;
      try {
        const retryRes = await fetch(railwayUrl, {
          method: 'POST',
          headers: railwayHeaders,
          body: JSON.stringify(retryBody),
        });
        if (retryRes.ok) {
          response = retryRes;
        } else {
          console.error('Railway retry also failed:', retryRes.status);
          return new Response(
            JSON.stringify({ leads: [], total: 0, success: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (retryErr) {
        console.error('Railway retry fetch failed:', retryErr);
        return new Response(
          JSON.stringify({ leads: [], total: 0, success: true }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Railway API error:', response.status, errorText);
      await refundCredit(`upstream_${response.status}`);
      return new Response(
        JSON.stringify({ leads: [], total: 0, success: true }),
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

    if (rawLeads.length === 0 && (requestBody.industry || requestBody.location)) {
      // Retry 1: drop industry (keep location + job_title)
      if (requestBody.industry) {
        const noIndustry = { ...requestBody };
        delete noIndustry.industry;
        console.log('0 results — retrying without industry:', JSON.stringify(noIndustry));
        try {
          const r = await fetch(railwayUrl, { method: 'POST', headers: railwayHeaders, body: JSON.stringify(noIndustry) });
          if (r.ok) {
            const d = await r.json();
            console.log('No-industry retry response (first 1000):', JSON.stringify(d).substring(0, 1000));
            rawLeads = parseLeadsFromData(d);
          }
        } catch (e) { console.log('No-industry retry failed:', e); }
      }

      // Retry 2: if still 0, drop location too — just job_title + limit
      if (rawLeads.length === 0 && requestBody.location) {
        const jobOnly: Record<string, any> = { limit: requestBody.limit };
        if (requestBody.job_title) jobOnly.job_title = requestBody.job_title;
        if (requestBody.seniority) jobOnly.seniority = requestBody.seniority;
        if (requestBody.offset) jobOnly.offset = requestBody.offset;
        console.log('0 results — final retry, job title only:', JSON.stringify(jobOnly));
        try {
          const r = await fetch(railwayUrl, { method: 'POST', headers: railwayHeaders, body: JSON.stringify(jobOnly) });
          if (r.ok) {
            const d = await r.json();
            console.log('Job-only retry response (first 1000):', JSON.stringify(d).substring(0, 1000));
            rawLeads = parseLeadsFromData(d);
          }
        } catch (e) { console.log('Job-only retry failed:', e); }
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
      return new Response(
        JSON.stringify({ success: true, leads: [], total: 0, from_cache: false,
          message: 'No leads found for this search. Try different search criteria.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map leads to expected format
    const leads: ScoredLead[] = rawLeads
      .map(mapRailwayLead)
      .filter(lead => lead.contact_name || lead.company_name)
      .sort((a, b) => b.scores.overall_score - a.scores.overall_score);

    console.log('Processed leads count:', leads.length);
    if (leads.length > 0) {
      console.log('First processed lead:', JSON.stringify(leads[0], null, 2));
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        leads,
        total: data.total || leads.length,
        from_cache: data.from_cache || false
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
    
    return new Response(
      JSON.stringify({ 
        error: clientMessage,
        error_code: isAuthError ? 'auth_error' : 'fetch_error',
        leads: [] 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: isAuthError ? 401 : 500 
      }
    );
  }
});
