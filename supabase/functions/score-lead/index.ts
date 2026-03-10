import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Deterministic hash for per-lead variation
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

interface ScoreResult {
  score: number;
  icp_score: number;
  intent_score: number;
  enrichment_score: number;
  reasoning: string;
  recommendations: string[];
  buying_signals: string[];
}

function scoreLead(data: {
  companyName?: string;
  contactName?: string;
  industry?: string;
  companySize?: string;
  jobTitle?: string;
  seniority?: string;
  contactEmail?: string;
  linkedinUrl?: string;
  companyWebsite?: string;
  department?: string;
  technologies?: string[];
  notes?: string;
}): ScoreResult {
  const seedStr = `${data.contactName || ''}|${data.companyName || ''}|${data.jobTitle || ''}`;
  const seed = hashString(seedStr);
  const variation = (seed % 11) - 5;

  let icpScore = 40;
  let intentScore = 35;
  let enrichmentScore = 30;
  const reasons: string[] = [];
  const recommendations: string[] = [];
  const buyingSignals: string[] = [];

  // === ICP SCORING: Job Title / Seniority ===
  const jobTitle = (data.jobTitle || '').toLowerCase();
  const seniority = (data.seniority || '').toLowerCase();

  if (jobTitle.includes('ceo') || jobTitle.includes('chief executive')) {
    icpScore += 38;
    reasons.push('CEO / Chief Executive - top decision maker');
    buyingSignals.push('Key Decision Maker');
  } else if (jobTitle.includes('founder') || jobTitle.includes('co-founder')) {
    icpScore += 35;
    reasons.push('Founder - ultimate authority');
    buyingSignals.push('Key Decision Maker');
  } else if (jobTitle.includes('owner') || jobTitle.includes('president')) {
    icpScore += 32;
    reasons.push('Owner/President - direct budget authority');
    buyingSignals.push('Key Decision Maker');
  } else if (jobTitle.includes('cto') || jobTitle.includes('chief technology')) {
    icpScore += 30;
    reasons.push('CTO - technology decision maker');
    buyingSignals.push('Tech Buyer');
  } else if (jobTitle.includes('cfo') || jobTitle.includes('chief financial')) {
    icpScore += 28;
    reasons.push('CFO - budget authority');
    buyingSignals.push('Budget Authority');
  } else if (jobTitle.includes('coo') || jobTitle.includes('cmo') || jobTitle.includes('cro') || jobTitle.includes('cio')) {
    icpScore += 26;
    reasons.push('C-suite leader');
    buyingSignals.push('Decision Maker');
  } else if (jobTitle.includes('vp') || jobTitle.includes('vice president')) {
    icpScore += 22;
    reasons.push('VP-level authority');
    buyingSignals.push('Decision Maker');
  } else if (jobTitle.includes('director')) {
    icpScore += 18;
    reasons.push('Director-level influence');
    buyingSignals.push('Decision Maker');
  } else if (jobTitle.includes('head of') || jobTitle.includes('head,')) {
    icpScore += 16;
    reasons.push('Department head');
  } else if (jobTitle.includes('senior') && (jobTitle.includes('manager') || jobTitle.includes('lead'))) {
    icpScore += 14;
    reasons.push('Senior management');
  } else if (jobTitle.includes('manager')) {
    icpScore += 10;
    reasons.push('Management level');
  } else if (jobTitle.includes('lead') || jobTitle.includes('principal')) {
    icpScore += 8;
    reasons.push('Team lead / principal');
  } else if (jobTitle.includes('senior')) {
    icpScore += 6;
    reasons.push('Senior individual contributor');
  } else if (jobTitle.includes('specialist') || jobTitle.includes('analyst') || jobTitle.includes('coordinator')) {
    icpScore += 2;
    reasons.push('Individual contributor');
  } else if (!jobTitle) {
    reasons.push('No job title available');
    recommendations.push('Add job title for better scoring');
  } else {
    icpScore += 3;
    reasons.push(`Job title: ${data.jobTitle}`);
  }

  // Seniority fallback (if job title didn't match but seniority is set)
  if (seniority && !jobTitle) {
    if (['cxo', 'c-level', 'c-suite', 'executive'].includes(seniority)) {
      icpScore += 20;
    } else if (seniority === 'vp') {
      icpScore += 15;
    } else if (seniority === 'director') {
      icpScore += 12;
    } else if (seniority === 'manager') {
      icpScore += 8;
    } else if (seniority === 'senior') {
      icpScore += 5;
    }
  }

  // === INTENT SCORING: Revenue/Growth alignment ===
  if (jobTitle.includes('revenue') || jobTitle.includes('growth') || jobTitle.includes('sales') || jobTitle.includes('business development')) {
    intentScore += 15;
    buyingSignals.push('Revenue Focus');
  }
  if (jobTitle.includes('marketing') || jobTitle.includes('demand gen') || jobTitle.includes('partnerships')) {
    intentScore += 10;
    buyingSignals.push('Marketing Leader');
  }
  if (jobTitle.includes('operations') || jobTitle.includes('strategy')) {
    intentScore += 7;
  }
  if (jobTitle.includes('tech') || jobTitle.includes('it') || jobTitle.includes('engineer') || jobTitle.includes('developer') || jobTitle.includes('devops')) {
    buyingSignals.push('Tech Buyer');
  }
  if (jobTitle.includes('finance') || jobTitle.includes('procurement')) {
    buyingSignals.push('Budget Authority');
  }

  // === COMPANY SIZE SCORING ===
  const companySize = (data.companySize || '').toString().toLowerCase();
  if (companySize.includes('10001') || companySize.includes('5001')) {
    icpScore += 6;
    intentScore += 12;
    buyingSignals.push('Enterprise');
    reasons.push('Enterprise-scale company');
  } else if (companySize.includes('1001') || companySize.includes('501')) {
    icpScore += 10;
    intentScore += 14;
    buyingSignals.push('Mid-Market');
    reasons.push('Mid-market company - strong budget potential');
  } else if (companySize.includes('201') || companySize.includes('500')) {
    icpScore += 12;
    intentScore += 10;
    buyingSignals.push('Mid-Market');
    reasons.push('Growth-stage company');
  } else if (companySize.includes('51') || companySize.includes('200')) {
    icpScore += 8;
    intentScore += 8;
    reasons.push('SMB with growth potential');
  } else if (companySize.includes('11') || companySize.includes('50')) {
    icpScore += 4;
    intentScore += 4;
    reasons.push('Small business');
  } else if (companySize.includes('1-10') || companySize.includes('micro')) {
    icpScore += 2;
    intentScore += 2;
    reasons.push('Micro business');
  } else if (!companySize) {
    recommendations.push('Add company size for better scoring');
  }

  // === INDUSTRY SCORING ===
  const industry = (data.industry || '').toLowerCase();
  if (industry.includes('software') || industry.includes('technology') || industry.includes('information technology')) {
    intentScore += 8;
    buyingSignals.push('Tech Industry');
    reasons.push('High-value tech industry');
  } else if (industry.includes('financial') || industry.includes('banking') || industry.includes('insurance')) {
    intentScore += 7;
    reasons.push('Financial services - high deal value');
  } else if (industry.includes('consulting') || industry.includes('marketing')) {
    intentScore += 6;
    reasons.push('Professional services');
  } else if (industry.includes('health') || industry.includes('education')) {
    intentScore += 4;
    reasons.push(`${data.industry} sector`);
  } else if (industry.includes('retail') || industry.includes('manufacturing')) {
    intentScore += 3;
    reasons.push(`${data.industry} sector`);
  } else if (industry) {
    intentScore += 2;
    reasons.push(`Industry: ${data.industry}`);
  } else {
    recommendations.push('Add industry for better scoring');
  }

  // === ENRICHMENT / DATA COMPLETENESS ===
  const email = data.contactEmail || '';
  if (email) {
    enrichmentScore += 18;
    if (!email.includes('gmail.') && !email.includes('yahoo.') && !email.includes('hotmail.') && !email.includes('outlook.')) {
      enrichmentScore += 5;
      buyingSignals.push('Corporate Email');
    }
    buyingSignals.push('Email Available');
  } else {
    recommendations.push('Add email address for outreach');
  }
  if (data.linkedinUrl) enrichmentScore += 12;
  if (data.companyWebsite) enrichmentScore += 10;
  if (data.industry) enrichmentScore += 5;
  if (data.companyName) enrichmentScore += 3;
  if (data.contactName) enrichmentScore += 2;
  if (data.seniority) enrichmentScore += 3;
  if (data.department) enrichmentScore += 2;
  if (data.technologies && data.technologies.length > 0) {
    enrichmentScore += 5;
    reasons.push(`${data.technologies.length} technologies tracked`);
  }

  // === APPLY PER-LEAD VARIATION ===
  icpScore += variation;
  intentScore += (seed % 7) - 3;
  enrichmentScore += ((seed >> 3) % 5) - 2;

  // Cap scores
  icpScore = Math.max(5, Math.min(100, icpScore));
  intentScore = Math.max(5, Math.min(100, intentScore));
  enrichmentScore = Math.max(5, Math.min(100, enrichmentScore));

  const overallScore = Math.round((icpScore * 0.4) + (intentScore * 0.3) + (enrichmentScore * 0.3));

  // Add general recommendations
  if (overallScore >= 70) {
    recommendations.push('High-priority lead - engage immediately');
  } else if (overallScore >= 50) {
    recommendations.push('Good prospect - add to outreach sequence');
  } else {
    recommendations.push('Nurture lead - enrich data before outreach');
  }

  if (!data.linkedinUrl) {
    recommendations.push('Add LinkedIn URL for better enrichment');
  }

  return {
    score: Math.max(5, Math.min(100, overallScore)),
    icp_score: icpScore,
    intent_score: intentScore,
    enrichment_score: enrichmentScore,
    reasoning: reasons.join(' · ') || 'Scored based on available data',
    recommendations: recommendations.slice(0, 4),
    buying_signals: buyingSignals.length > 0 ? buyingSignals : ['Prospect'],
  };
}

// Input validation
const validateInputs = (data: any) => {
  const errors: string[] = [];
  if (!data.companyName || typeof data.companyName !== 'string') {
    errors.push('Company name is required');
  } else if (data.companyName.length > 200) {
    errors.push('Company name must be less than 200 characters');
  }
  return errors;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    // Support both formats: { leadId } for DB leads, or direct field data
    if (body.leadId) {
      // Score an existing lead from DB
      const supabaseService = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );

      const { data: lead, error: leadError } = await supabaseService
        .from('leads')
        .select('*')
        .eq('id', body.leadId)
        .eq('user_id', user.id)
        .single();

      if (leadError || !lead) {
        return new Response(JSON.stringify({ error: 'Lead not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = scoreLead({
        companyName: lead.company_name,
        contactName: lead.contact_name,
        industry: lead.industry,
        companySize: lead.company_size || lead.employee_count,
        jobTitle: lead.job_title,
        seniority: lead.seniority,
        contactEmail: lead.contact_email,
        linkedinUrl: lead.linkedin_url,
        companyWebsite: lead.company_website,
        department: lead.department,
        technologies: lead.technologies,
        notes: lead.notes,
      });

      // Update the lead's icp_score in the database
      await supabaseService
        .from('leads')
        .update({ icp_score: result.score })
        .eq('id', body.leadId)
        .eq('user_id', user.id);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Direct field data (from AddLeadDialog)
    const validationErrors = validateInputs(body);
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ error: validationErrors.join(', ') }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = scoreLead({
      companyName: body.companyName,
      contactName: body.contactName,
      industry: body.industry,
      companySize: body.companySize,
      jobTitle: body.jobTitle || body.job_title,
      seniority: body.seniority,
      contactEmail: body.contactEmail || body.contact_email,
      linkedinUrl: body.linkedinUrl || body.linkedin_url,
      companyWebsite: body.companyWebsite || body.company_website,
      department: body.department,
      technologies: body.technologies,
      notes: body.notes,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in score-lead function:', error);
    return new Response(
      JSON.stringify({
        error: 'Lead scoring temporarily unavailable',
        score: 50,
        icp_score: 50,
        intent_score: 50,
        enrichment_score: 50,
        reasoning: 'Unable to score lead automatically. Manual review recommended.',
        recommendations: ['Review lead manually', 'Add more information'],
        buying_signals: ['Prospect'],
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
