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
function mapRailwayLead(lead: any): ScoredLead {
  // Use provided scores or calculate them
  const scores = lead.scores ? {
    icp_score: lead.scores.icp_score || lead.scores.icpScore || 50,
    intent_score: lead.scores.intent_score || lead.scores.intentScore || 50,
    enrichment_score: lead.scores.enrichment_score || lead.scores.enrichmentScore || 50,
    overall_score: lead.scores.overall_score || lead.scores.overallScore || 50,
  } : calculateScores(lead);
  
  return {
    job_title: lead.job_title || lead.jobTitle || '',
    company_name: lead.company_name || lead.companyName || lead.company || '',
    company_domain: lead.company_domain || lead.companyDomain || lead.domain || lead.website || '',
    business_email: lead.business_email || lead.businessEmail || lead.email || lead.work_email || null,
    contact_name: lead.contact_name || lead.contactName || lead.name || lead.full_name || lead.fullName || '',
    industry: lead.industry || '',
    company_size: lead.company_size || lead.companySize || lead.size || '',
    country: lead.country || lead.location || lead.location_country || '',
    linkedin_url: lead.linkedin_url || lead.linkedinUrl || lead.linkedin || null,
    scores,
    score_explanation: lead.score_explanation || lead.scoreExplanation || generateScoreExplanation(lead, scores),
    buying_signals: lead.buying_signals || lead.buyingSignals || generateBuyingSignals(lead),
  };
}

// Fetch cached search results from Railway
async function fetchCachedResults(railwayBaseUrl: string): Promise<{ searches: any[], error?: string }> {
  try {
    // Railway exposes cache stats, let's check what's available
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

    // Prepare request body for Railway API - exact PDL format
    // Handle job_title - either from direct filter or extracted from keywords
    let jobTitle: string | undefined = filters.job_title;
    if (!jobTitle && filters.keywords && filters.keywords.length > 0) {
      const extractedTitle = extractJobTitleFromKeywords(filters.keywords);
      if (extractedTitle) {
        jobTitle = extractedTitle;
      }
      console.log('Extracted job title from keywords:', jobTitle);
    }

    // Build request body matching exact PDL schema
    const requestBody: Record<string, any> = {
      job_title: jobTitle || '',
      location: filters.country || '',
      industry: filters.industry || '',
      company: filters.company || '',
      company_size: filters.company_size || '',
      seniority: filters.seniority || '',
      limit: Math.min(filters.limit || 10, 100),
    };

    // Check if we have at least one search parameter
    const hasSearchParam = requestBody.job_title || requestBody.location || 
                           requestBody.industry || requestBody.company || 
                           requestBody.company_size || requestBody.seniority;
    
    if (!hasSearchParam) {
      console.warn('No search parameters provided, adding default job_title');
      requestBody.job_title = 'CEO OR Founder OR CTO OR Director';
    }

    console.log('=== REQUEST TO RAILWAY ===');
    console.log('URL:', railwayUrl);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    // Call Railway backend
    const response = await fetch(railwayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Railway API error:', response.status, errorText);
      
      // Parse error for more specific messages
      let errorMessage = `Railway API error: ${response.status}`;
      let errorCode = 'api_error';
      let cachedSearches: any[] = [];
      
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.detail) {
          errorMessage = errorJson.detail;
        }
        if (errorJson.error) {
          errorMessage = errorJson.error;
        }
      } catch {
        // Use raw text if not JSON
        if (errorText) errorMessage = errorText;
      }
      
      // Handle 402 Payment Required (PDL credits exhausted)
      if (response.status === 402) {
        errorCode = 'credits_exhausted';
        errorMessage = 'Search credits exhausted. Cached results may be available for previous searches.';
        
        // Try to get cached results info
        const cacheData = await fetchCachedResults(railwayUrl);
        cachedSearches = cacheData.searches;
      }
      
      // Handle 400 Bad Request (missing params)
      if (response.status === 400) {
        errorCode = 'invalid_request';
        if (errorMessage.includes('search parameter')) {
          errorMessage = 'At least one search filter is required. Please specify a job title, industry, or location.';
        }
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage, 
          error_code: errorCode,
          leads: [],
          cached_searches: cachedSearches
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('=== RESPONSE FROM RAILWAY ===');
    console.log('Response status:', response.status);
    console.log('Response headers:', JSON.stringify(Object.fromEntries(response.headers.entries())));
    console.log('Response data type:', typeof data);
    console.log('Response data keys:', Object.keys(data));
    console.log('Full response data:', JSON.stringify(data, null, 2).substring(0, 2000));

    // Handle different response formats from Railway
    let rawLeads: any[] = [];
    if (Array.isArray(data)) {
      console.log('Data is array format');
      rawLeads = data;
    } else if (data.leads && Array.isArray(data.leads)) {
      console.log('Data has leads array');
      rawLeads = data.leads;
    } else if (data.data && Array.isArray(data.data)) {
      console.log('Data has data array');
      rawLeads = data.data;
    } else if (data.results && Array.isArray(data.results)) {
      console.log('Data has results array');
      rawLeads = data.results;
    } else if (data.people && Array.isArray(data.people)) {
      console.log('Data has people array (PDL format)');
      rawLeads = data.people;
    }

    console.log('=== LEAD DATA ===');
    console.log('Raw leads count:', rawLeads.length);
    if (rawLeads.length > 0) {
      console.log('First raw lead keys:', Object.keys(rawLeads[0]));
      console.log('First raw lead full:', JSON.stringify(rawLeads[0], null, 2));
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

    // If no leads returned, check if it's a caching issue
    if (leads.length === 0 && rawLeads.length === 0) {
      console.log('No leads returned - checking cache availability');
      const cacheData = await fetchCachedResults(railwayUrl);
      
      return new Response(
        JSON.stringify({ 
          success: true,
          leads: [],
          total: 0,
          message: 'No leads found for this search. Try different search criteria or check cached searches.',
          cached_searches: cacheData.searches
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch leads';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        leads: [] 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: errorMessage === 'Invalid user token' ? 401 : 500 
      }
    );
  }
});
