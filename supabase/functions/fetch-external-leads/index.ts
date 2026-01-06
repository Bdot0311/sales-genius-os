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

// Job-related keywords to extract from keywords array
const JOB_KEYWORDS = [
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'cpo', 'cro',
  'founder', 'co-founder', 'cofounder', 'owner',
  'president', 'vice president', 'vp',
  'director', 'head', 'chief',
  'manager', 'lead', 'senior', 'executive',
  'partner', 'principal'
];

// Extract job titles from keywords
function extractJobTitleFromKeywords(keywords: string[]): string | null {
  if (!keywords || keywords.length === 0) return null;
  
  const foundJobs: string[] = [];
  for (const keyword of keywords) {
    const lower = keyword.toLowerCase();
    for (const jobKeyword of JOB_KEYWORDS) {
      if (lower.includes(jobKeyword)) {
        foundJobs.push(keyword);
        break;
      }
    }
  }
  
  return foundJobs.length > 0 ? foundJobs.join(' OR ') : null;
}

// Calculate scores if not provided by Railway API
function calculateScores(lead: any): LeadScores {
  let icpScore = 50;
  let intentScore = 50;
  let enrichmentScore = 50;

  // ICP scoring based on job title seniority
  const jobTitle = (lead.job_title || '').toLowerCase();
  if (jobTitle.includes('ceo') || jobTitle.includes('founder') || jobTitle.includes('owner')) {
    icpScore += 35;
  } else if (jobTitle.includes('cto') || jobTitle.includes('cfo') || jobTitle.includes('coo') || jobTitle.includes('cmo')) {
    icpScore += 30;
  } else if (jobTitle.includes('vp') || jobTitle.includes('vice president')) {
    icpScore += 25;
  } else if (jobTitle.includes('director')) {
    icpScore += 20;
  } else if (jobTitle.includes('head of') || jobTitle.includes('manager')) {
    icpScore += 15;
  }

  // Company size scoring
  const companySize = lead.company_size || '';
  if (companySize.includes('201') || companySize.includes('500') || companySize.includes('1000')) {
    icpScore += 10;
    intentScore += 10;
  } else if (companySize.includes('51') || companySize.includes('200')) {
    icpScore += 8;
    intentScore += 8;
  }

  // Enrichment scoring based on data completeness
  if (lead.business_email || lead.email) enrichmentScore += 15;
  if (lead.linkedin_url || lead.linkedin) enrichmentScore += 10;
  if (lead.company_domain || lead.domain) enrichmentScore += 10;
  if (lead.industry) enrichmentScore += 5;
  if (lead.country || lead.location) enrichmentScore += 5;

  // Cap scores at 100
  icpScore = Math.min(100, icpScore);
  intentScore = Math.min(100, intentScore);
  enrichmentScore = Math.min(100, enrichmentScore);

  const overallScore = Math.round((icpScore * 0.4) + (intentScore * 0.3) + (enrichmentScore * 0.3));

  return {
    icp_score: icpScore,
    intent_score: intentScore,
    enrichment_score: enrichmentScore,
    overall_score: overallScore,
  };
}

// Generate score explanation
function generateScoreExplanation(lead: any, scores: LeadScores): string {
  const parts: string[] = [];
  
  if (scores.icp_score >= 80) {
    parts.push('Strong ICP match');
  } else if (scores.icp_score >= 60) {
    parts.push('Good ICP fit');
  }

  const jobTitle = (lead.job_title || '').toLowerCase();
  if (jobTitle.includes('ceo') || jobTitle.includes('founder')) {
    parts.push('C-level executive');
  } else if (jobTitle.includes('vp') || jobTitle.includes('director')) {
    parts.push('Senior leadership');
  }

  if (lead.industry) {
    parts.push(`${lead.industry} industry`);
  }

  return parts.length > 0 ? parts.join(' - ') : 'Lead discovered from search';
}

// Generate buying signals
function generateBuyingSignals(lead: any): string[] {
  const signals: string[] = [];
  const jobTitle = (lead.job_title || '').toLowerCase();

  if (jobTitle.includes('ceo') || jobTitle.includes('founder') || jobTitle.includes('owner') ||
      jobTitle.includes('vp') || jobTitle.includes('director') || jobTitle.includes('head')) {
    signals.push('Decision Maker');
  }

  if (jobTitle.includes('tech') || jobTitle.includes('it') || jobTitle.includes('engineer') ||
      jobTitle.includes('developer') || jobTitle.includes('cto')) {
    signals.push('Tech Buyer');
  }

  if (jobTitle.includes('sales') || jobTitle.includes('revenue') || jobTitle.includes('growth')) {
    signals.push('Revenue Focus');
  }

  if (jobTitle.includes('marketing') || jobTitle.includes('cmo') || jobTitle.includes('brand')) {
    signals.push('Marketing Leader');
  }

  return signals.length > 0 ? signals : ['Prospect'];
}

// Map Railway response to ScoredLead format
// Railway now pre-transforms leads, so we just add scores if missing
function mapRailwayLead(lead: any): ScoredLead {
  // Use provided scores or calculate them
  const scores = lead.scores || calculateScores(lead);
  
  return {
    job_title: lead.job_title || '',
    company_name: lead.company_name || '',
    company_domain: lead.company_domain || '',
    business_email: lead.business_email || null,
    contact_name: lead.contact_name || '',
    industry: lead.industry || '',
    company_size: lead.company_size || '',
    country: lead.country || '',
    linkedin_url: lead.linkedin_url || null,
    scores,
    score_explanation: generateScoreExplanation(lead, scores),
    buying_signals: generateBuyingSignals(lead),
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
  growth: { monthlyCredits: 200, dailyLimit: 25 },
  pro: { monthlyCredits: 700, dailyLimit: 100 },
  elite: { monthlyCredits: 2000, dailyLimit: 500 },
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

    // Get Railway API URL from secrets
    const railwayUrl = Deno.env.get('RAILWAY_LEADS_API_URL');
    if (!railwayUrl) {
      console.error('RAILWAY_LEADS_API_URL not configured');
      return new Response(
        JSON.stringify({ error: 'Lead data provider not configured', leads: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Calling Railway API:', railwayUrl);

    // Prepare request body for Railway API
    // IMPORTANT: omit empty fields entirely (some providers treat empty strings as real filters)
    let jobTitle: string | undefined = filters.job_title;
    if (!jobTitle && filters.keywords && filters.keywords.length > 0) {
      const extractedTitle = extractJobTitleFromKeywords(filters.keywords);
      if (extractedTitle) jobTitle = extractedTitle;
      console.log('Extracted job title from keywords:', jobTitle);
    }

    const requestBody: Record<string, any> = {
      ...(jobTitle ? { job_title: jobTitle } : {}),
      ...(filters.country ? { location: filters.country } : {}),
      ...(filters.industry ? { industry: filters.industry } : {}),
      ...(filters.company ? { company: filters.company } : {}),
      ...(filters.company_size ? { company_size: filters.company_size } : {}),
      ...(filters.seniority ? { seniority: filters.seniority } : {}),
      ...(filters.keywords && filters.keywords.length > 0 ? { keywords: filters.keywords } : {}),
      limit: Math.min(filters.limit || 10, 100),
      // Tell Railway to fetch from PDL if cache is empty
      skip_cache: false,
      fallback_to_pdl: true,
    };

    // Check if we have at least one real search parameter
    const hasSearchParam = Boolean(
      requestBody.job_title ||
      requestBody.location ||
      requestBody.industry ||
      requestBody.company ||
      requestBody.company_size ||
      requestBody.seniority ||
      (requestBody.keywords && requestBody.keywords.length > 0)
    );

    if (!hasSearchParam) {
      console.warn('No search parameters provided, adding default job_title');
      requestBody.job_title = 'CEO OR Founder OR CTO OR Director';
    }

    console.log('=== REQUEST TO RAILWAY ===');
    console.log('URL:', railwayUrl);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    const fetchRailway = async (body: Record<string, any>) => {
      const res = await fetch(railwayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Handle 402 Payment Required
      if (res.status === 402) {
        console.log('PDL credits exhausted (402)');
        return { status: 402, data: null as any };
      }

      if (!res.ok) {
        const errorText = await res.text();
        console.error('Railway API error:', res.status, errorText);
        return { status: res.status, data: { _errorText: errorText } as any };
      }

      const json = await res.json();
      return { status: res.status, data: json };
    };

    // 1) First call (DB/cache first, with Railway-controlled fallback_to_pdl)
    const first = await fetchRailway(requestBody);

    if (first.status === 402) {
      return new Response(
        JSON.stringify({
          error: 'Search credits exhausted. Please add more credits to continue searching.',
          error_code: 'credits_exhausted',
          leads: [],
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (first.status >= 400) {
      // Log full details server-side but return generic error to client
      let clientMessage = 'Lead search failed. Please try again.';
      let errorCode = 'api_error';

      if (first.status === 400) {
        errorCode = 'invalid_request';
        clientMessage = 'Invalid search parameters. Please specify at least one filter.';
      } else if (first.status === 401 || first.status === 403) {
        errorCode = 'auth_error';
        clientMessage = 'Authentication error. Please try again.';
      } else if (first.status === 500) {
        errorCode = 'server_error';
        clientMessage = 'Service temporarily unavailable. Please try again later.';
      }

      return new Response(
        JSON.stringify({ error: clientMessage, error_code: errorCode, leads: [] }),
        { status: first.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let data = first.data;
    console.log('=== RESPONSE FROM RAILWAY (primary) ===');
    console.log('Response status:', first.status);
    console.log('Response data keys:', Object.keys(data));
    console.log('from_cache:', data.from_cache);
    console.log('source:', data.source);
    console.log('count:', data.count);
    console.log('Full response data:', JSON.stringify(data, null, 2).substring(0, 2000));

    // Handle different response formats - prioritize data.leads (pre-transformed by Railway)
    let rawLeads: any[] = [];
    if (data.leads && Array.isArray(data.leads)) {
      console.log('Using pre-transformed leads array from Railway');
      rawLeads = data.leads;
    } else if (Array.isArray(data)) {
      console.log('Data is direct array format');
      rawLeads = data;
    } else if (data.data && Array.isArray(data.data)) {
      console.log('Using data.data array (raw PDL)');
      rawLeads = data.data;
    } else if (data.results && Array.isArray(data.results)) {
      console.log('Using data.results array');
      rawLeads = data.results;
    }

    // 2) If Railway returned an empty cached response, force a fresh lookup (DB then PDL)
    if (rawLeads.length === 0 && (data.from_cache === true || data.source === 'cache')) {
      console.log('Empty cached result from Railway; forcing fresh lookup with skip_cache=true');
      const retryBody = { ...requestBody, skip_cache: true, fallback_to_pdl: true };
      const retry = await fetchRailway(retryBody);

      if (retry.status === 402) {
        return new Response(
          JSON.stringify({
            error: 'Search credits exhausted. Please add more credits to continue searching.',
            error_code: 'credits_exhausted',
            leads: [],
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (retry.status < 400) {
        data = retry.data;
        console.log('=== RESPONSE FROM RAILWAY (forced fresh) ===');
        console.log('Response status:', retry.status);
        console.log('from_cache:', data.from_cache);
        console.log('source:', data.source);
        console.log('count:', data.count);

        rawLeads = [];
        if (data.leads && Array.isArray(data.leads)) rawLeads = data.leads;
        else if (Array.isArray(data)) rawLeads = data;
        else if (data.data && Array.isArray(data.data)) rawLeads = data.data;
        else if (data.results && Array.isArray(data.results)) rawLeads = data.results;
      }
    }

    console.log('=== LEAD DATA ===');
    console.log('Raw leads count:', rawLeads.length);
    if (rawLeads.length > 0) {
      console.log('First raw lead:', JSON.stringify(rawLeads[0], null, 2));
    }

    // If no leads found, return empty - NO cache fallback (must match search criteria)
    if (rawLeads.length === 0) {
      console.log('No leads returned for search criteria');
      return new Response(
        JSON.stringify({ 
          success: true,
          leads: [],
          total: 0,
          from_cache: false,
          message: 'No leads found for this search. Try different search criteria.'
        }),
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
