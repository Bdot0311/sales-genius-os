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

// Calculate scores based on lead data
function calculateScores(lead: any): LeadScores {
  let icpScore = 50;
  let intentScore = 50;
  let enrichmentScore = 50;

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

  const companySize = lead.company_size || '';
  if (companySize.includes('201') || companySize.includes('500') || companySize.includes('1000')) {
    icpScore += 10;
    intentScore += 10;
  } else if (companySize.includes('51') || companySize.includes('200')) {
    icpScore += 8;
    intentScore += 8;
  }

  if (lead.work_email) enrichmentScore += 15;
  if (lead.linkedin_url) enrichmentScore += 10;
  if (lead.job_company_website) enrichmentScore += 10;
  if (lead.industry) enrichmentScore += 5;
  if (lead.location_country) enrichmentScore += 5;

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

// Map PDL response to ScoredLead format
function mapPDLLead(lead: any): ScoredLead {
  const scores = calculateScores(lead);
  
  // Get employee count range for company size
  let companySize = '';
  const employeeCount = lead.job_company_size;
  if (employeeCount) {
    if (employeeCount <= 10) companySize = '1-10';
    else if (employeeCount <= 50) companySize = '11-50';
    else if (employeeCount <= 200) companySize = '51-200';
    else if (employeeCount <= 500) companySize = '201-500';
    else if (employeeCount <= 1000) companySize = '501-1000';
    else companySize = '1000+';
  }
  
  return {
    job_title: lead.job_title || '',
    company_name: lead.job_company_name || '',
    company_domain: lead.job_company_website || '',
    business_email: lead.work_email || null,
    contact_name: lead.full_name || '',
    industry: lead.industry || lead.job_company_industry || '',
    company_size: companySize,
    country: lead.location_country || '',
    linkedin_url: lead.linkedin_url || null,
    scores,
    score_explanation: generateScoreExplanation(lead, scores),
    buying_signals: generateBuyingSignals(lead),
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const filters: ExternalLeadFilters = await req.json();
    console.log('Received filters:', JSON.stringify(filters));

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

    // Use PDL API directly
    const pdlApiKey = Deno.env.get('PDL_API_KEY');
    if (!pdlApiKey) {
      console.error('PDL_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Lead data provider not configured', leads: [] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build PDL search query
    const pdlQuery: Record<string, any> = {
      size: Math.min(filters.limit || 50, 100),
      dataset: 'all',
    };

    // Build SQL-like query for PDL
    const queryParts: string[] = [];

    if (filters.job_title) {
      // Handle OR queries for job titles
      const titles = filters.job_title.split(' OR ').map(t => t.trim());
      if (titles.length > 1) {
        const titleQuery = titles.map(t => `job_title='${t}'`).join(' OR ');
        queryParts.push(`(${titleQuery})`);
      } else {
        queryParts.push(`job_title='${filters.job_title}'`);
      }
    }

    if (filters.industry) {
      queryParts.push(`industry='${filters.industry}'`);
    }

    if (filters.country) {
      queryParts.push(`location_country='${filters.country}'`);
    }

    if (filters.company) {
      queryParts.push(`job_company_name='${filters.company}'`);
    }

    // If no query parts, use a default search
    if (queryParts.length === 0) {
      queryParts.push("job_title='CEO' OR job_title='Founder' OR job_title='CTO'");
    }

    pdlQuery.query = queryParts.join(' AND ');

    console.log('Calling PDL API with query:', JSON.stringify(pdlQuery));

    const response = await fetch('https://api.peopledatalabs.com/v5/person/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': pdlApiKey,
      },
      body: JSON.stringify(pdlQuery),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('PDL API error:', response.status, errorText);
      
      // Don't throw errors for empty results or credit issues - just return empty
      if (response.status === 402) {
        console.log('PDL credits exhausted, returning empty results');
        return new Response(
          JSON.stringify({ 
            success: true,
            leads: [],
            total: 0,
            message: 'No leads found for this search criteria.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          success: true,
          leads: [],
          total: 0,
          message: 'No leads found matching your criteria.'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('PDL API response - total:', data.total);

    const rawLeads = data.data || [];
    
    const leads: ScoredLead[] = rawLeads
      .map(mapPDLLead)
      .filter((lead: ScoredLead) => lead.contact_name || lead.company_name)
      .sort((a: ScoredLead, b: ScoredLead) => b.scores.overall_score - a.scores.overall_score);

    console.log('Processed leads count:', leads.length);

    return new Response(
      JSON.stringify({ 
        success: true,
        leads,
        total: data.total || leads.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-external-leads:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch leads';
    
    // For auth errors, return proper status
    if (errorMessage === 'Invalid user token') {
      return new Response(
        JSON.stringify({ error: errorMessage, leads: [] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // For other errors, return success with empty leads to avoid error UI
    return new Response(
      JSON.stringify({ 
        success: true,
        leads: [],
        total: 0,
        message: 'Unable to search leads at this time.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
