import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Personal/free email domains to exclude
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'gmx.com', 'live.com', 'msn.com', 'me.com', 'inbox.com', 'fastmail.com',
  'tutanota.com', 'hey.com', 'pm.me', 'proton.me', 'mailbox.org',
  'yahoo.co.uk', 'hotmail.co.uk', 'outlook.co.uk', 'googlemail.com'
]);

interface ExternalLeadFilters {
  job_title?: string;
  industry?: string;
  company_size?: string;
  country?: string;
  limit?: number;
}

interface ScoredLead {
  job_title: string;
  company_name: string;
  company_domain: string;
  business_email: string;
  contact_name: string;
  industry?: string;
  company_size?: string;
  country?: string;
  linkedin_url?: string;
  scores: {
    icp_score: number;
    intent_score: number;
    enrichment_score: number;
    overall_score: number;
  };
  score_explanation: string;
  buying_signals: string[];
}

function isBusinessEmail(email: string): boolean {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !PERSONAL_EMAIL_DOMAINS.has(domain);
}

function mapCompanySizeToRange(size: string): string {
  const sizeMap: Record<string, string> = {
    '1-10': '1-10',
    '11-50': '11-50',
    '51-200': '51-200',
    '201-500': '201-500',
    '501-1000': '501-1000',
    '1001-5000': '1001-5000',
    '5001-10000': '5001-10000',
    '10001+': '1000+'
  };
  return sizeMap[size] || size || 'Unknown';
}

function buildPDLQuery(filters: ExternalLeadFilters): string {
  const conditions: string[] = [];
  
  // Always filter for work emails
  conditions.push("work_email IS NOT NULL");
  
  if (filters.job_title) {
    // Use LIKE for flexible matching on job titles
    const escapedTitle = filters.job_title.replace(/'/g, "''");
    conditions.push(`job_title LIKE '%${escapedTitle}%'`);
  }
  
  if (filters.industry) {
    const escapedIndustry = filters.industry.replace(/'/g, "''").toLowerCase();
    conditions.push(`job_company_industry='${escapedIndustry}'`);
  }
  
  if (filters.company_size) {
    // Map our size filters to PDL format
    const sizeMapping: Record<string, string> = {
      '1-10': '1-10',
      '11-50': '11-50',
      '51-200': '51-200',
      '201-500': '201-500',
      '501-1000': '501-1000',
      '1001-5000': '1001-5000',
      '5001-10000': '5001-10000',
      '1000+': '10001+'
    };
    const pdlSize = sizeMapping[filters.company_size] || filters.company_size;
    conditions.push(`job_company_size='${pdlSize}'`);
  }
  
  if (filters.country) {
    const escapedCountry = filters.country.replace(/'/g, "''").toLowerCase();
    conditions.push(`location_country='${escapedCountry}'`);
  }
  
  return conditions.join(' AND ');
}

function scoreLead(person: any): { scores: ScoredLead['scores']; explanation: string; buyingSignals: string[] } {
  let icpScore = 50;
  let intentScore = 30;
  let enrichmentScore = 40;
  const buyingSignals: string[] = [];
  const reasons: string[] = [];

  // ICP Scoring based on job title seniority
  const title = (person.job_title || '').toLowerCase();
  const titleLevels = person.job_title_levels || [];
  
  if (title.includes('ceo') || title.includes('cto') || title.includes('cfo') || title.includes('coo') || title.includes('chief')) {
    icpScore += 30;
    reasons.push('C-level executive');
    buyingSignals.push('Decision Maker');
  } else if (title.includes('vp') || title.includes('vice president') || titleLevels.includes('vp')) {
    icpScore += 25;
    reasons.push('VP-level leadership');
    buyingSignals.push('Budget Authority');
  } else if (title.includes('director') || titleLevels.includes('director')) {
    icpScore += 20;
    reasons.push('Director-level role');
    buyingSignals.push('Influencer');
  } else if (title.includes('head of') || title.includes('manager')) {
    icpScore += 15;
    reasons.push('Management position');
  }

  // ICP Scoring based on company size
  const size = person.job_company_size || '';
  const largeSizes = ['201-500', '501-1000', '1001-5000', '5001-10000', '10001+'];
  if (largeSizes.includes(size)) {
    icpScore += 15;
    reasons.push('Enterprise company');
    buyingSignals.push('Enterprise');
  } else if (size === '51-200') {
    icpScore += 12;
    reasons.push('Growing company');
    buyingSignals.push('Growth Stage');
  }

  // ICP Scoring based on industry
  const industry = (person.job_company_industry || '').toLowerCase();
  if (industry.includes('technology') || industry.includes('software') || industry.includes('computer')) {
    icpScore += 10;
    intentScore += 10;
    reasons.push('Tech industry fit');
    buyingSignals.push('Tech Buyer');
  } else if (industry.includes('finance') || industry.includes('healthcare')) {
    icpScore += 8;
    reasons.push('High-value vertical');
  }

  // Enrichment score based on data completeness
  if (person.work_email) enrichmentScore += 15;
  if (person.linkedin_url) enrichmentScore += 15;
  if (person.job_company_website) enrichmentScore += 10;
  if (person.job_company_industry) enrichmentScore += 10;
  if (person.job_company_size) enrichmentScore += 10;

  // Intent signals based on role
  const role = (person.job_title_role || '').toLowerCase();
  if (role === 'sales' || role === 'marketing' || title.includes('sales') || title.includes('marketing') || title.includes('growth')) {
    intentScore += 20;
    buyingSignals.push('Revenue Focus');
  }
  if (role === 'operations' || role === 'product' || title.includes('operations') || title.includes('product')) {
    intentScore += 15;
    buyingSignals.push('Efficiency Focus');
  }

  // Cap scores at 100
  icpScore = Math.min(100, icpScore);
  intentScore = Math.min(100, intentScore);
  enrichmentScore = Math.min(100, enrichmentScore);

  // Calculate overall score (weighted average)
  const overallScore = Math.round(icpScore * 0.4 + intentScore * 0.35 + enrichmentScore * 0.25);

  const explanation = reasons.length > 0 
    ? `${reasons.slice(0, 3).join(', ')}. Overall fit: ${overallScore >= 70 ? 'Strong' : overallScore >= 50 ? 'Good' : 'Moderate'}.`
    : 'Basic profile - needs more data for accurate scoring.';

  return {
    scores: {
      icp_score: icpScore,
      intent_score: intentScore,
      enrichment_score: enrichmentScore,
      overall_score: overallScore,
    },
    explanation,
    buyingSignals: buyingSignals.slice(0, 4),
  };
}

function mapPDLPersonToLead(person: any): ScoredLead | null {
  const email = person.work_email;
  
  // Skip if no business email
  if (!email || !isBusinessEmail(email)) {
    return null;
  }

  const { scores, explanation, buyingSignals } = scoreLead(person);
  const fullName = person.full_name || `${person.first_name || ''} ${person.last_name || ''}`.trim();
  const companyDomain = person.job_company_website?.replace(/^https?:\/\//, '').replace(/\/$/, '') || '';

  return {
    job_title: person.job_title || 'Unknown',
    company_name: person.job_company_name || 'Unknown',
    company_domain: companyDomain,
    business_email: email,
    contact_name: fullName || 'Unknown',
    industry: person.job_company_industry || undefined,
    company_size: mapCompanySizeToRange(person.job_company_size),
    country: person.location_country || undefined,
    linkedin_url: person.linkedin_url || undefined,
    scores,
    score_explanation: explanation,
    buying_signals: buyingSignals,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const filters: ExternalLeadFilters = await req.json();
    console.log('Received filters:', filters);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    // Get PDL API key
    const pdlApiKey = Deno.env.get('PDL_API_KEY');
    if (!pdlApiKey) {
      console.error('PDL_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Lead data provider not configured', leads: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build PDL query
    const limit = Math.min(filters.limit || 25, 100);
    const sqlQuery = buildPDLQuery(filters);
    
    console.log('PDL SQL Query:', sqlQuery);

    // Call PDL Person Search API
    const pdlUrl = new URL('https://api.peopledatalabs.com/v5/person/search');
    pdlUrl.searchParams.set('sql', `SELECT * FROM person WHERE ${sqlQuery}`);
    pdlUrl.searchParams.set('size', limit.toString());

    console.log('Calling PDL API...');
    
    const pdlResponse = await fetch(pdlUrl.toString(), {
      method: 'GET',
      headers: {
        'X-Api-Key': pdlApiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!pdlResponse.ok) {
      const errorText = await pdlResponse.text();
      console.error('PDL API error:', pdlResponse.status, errorText);
      
      if (pdlResponse.status === 401) {
        return new Response(
          JSON.stringify({ error: 'Invalid API key for lead data provider', leads: [] }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (pdlResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Lead data provider credits exhausted', leads: [] }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Failed to fetch leads from data provider', leads: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pdlData = await pdlResponse.json();
    console.log('PDL returned', pdlData.total, 'total results,', pdlData.data?.length, 'in this batch');

    // Map PDL results to our lead format
    const leads: ScoredLead[] = [];
    for (const person of pdlData.data || []) {
      const lead = mapPDLPersonToLead(person);
      if (lead) {
        leads.push(lead);
      }
    }

    // Sort by overall score descending
    leads.sort((a, b) => b.scores.overall_score - a.scores.overall_score);

    console.log('Returning', leads.length, 'scored leads');

    return new Response(
      JSON.stringify({ 
        success: true,
        leads,
        total: pdlData.total || leads.length,
        credits_used: pdlData.data?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-external-leads:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        leads: []
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
