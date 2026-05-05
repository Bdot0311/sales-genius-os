import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type IntentLabel = 'Cold' | 'Warm' | 'Hot' | 'Very Hot';
type SignalType = 'lusha_contact' | 'lusha_company' | 'manual' | 'future_provider';

interface ScoreResult {
  score: number;
  intent_score: number;
  icp_score: number;
  enrichment_score: number;
  intent_label: IntentLabel;
  intent_reasons: string[];
  recommended_angle: string;
  signal_type: SignalType;
  signal_date: string;
  reasoning: string;
  recommendations: string[];
  buying_signals: string[];
}

function parseEmployeeCount(str: string): number {
  if (!str) return 0;
  const s = str.replace(/,/g, '').toLowerCase();
  const range = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return parseInt(range[1]);
  const single = s.match(/\d+/);
  if (single) return parseInt(single[0]);
  return 0;
}

function daysSince(dateStr?: string | null): number {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / 86_400_000;
}

function getIntentLabel(score: number): IntentLabel {
  if (score >= 85) return 'Very Hot';
  if (score >= 65) return 'Hot';
  if (score >= 40) return 'Warm';
  return 'Cold';
}

// ─── Priority decision-maker titles ───────────────────────────────────────────
const DM_TIER1 = /founder|co-?founder|ceo|chief executive/i;
const DM_TIER2_SALES = /vp\s*(of\s*)?sales|head of (growth|sales|revenue|demand)|sales director|director of sales/i;
const DM_TIER2_REV = /revenue operations|rev\s*ops|demand gen(eration)?|growth lead|sdr manager|head of sdr|head of sales dev/i;
const DM_TIER3 = /\bvp\b|vice president|director|\bcto\b|\bcmo\b|\bcoo\b|\bcro\b|\bcfo\b|\bcio\b/i;
const DM_TIER4 = /manager|team lead|\blead\b|principal/i;

function getRecommendedAngle(jobTitle: string): string {
  const jt = jobTitle || '';
  if (DM_TIER1.test(jt)) {
    return 'Position this as a way to create predictable pipeline without adding more manual sales work.';
  }
  if (DM_TIER2_SALES.test(jt)) {
    return 'Position this as a way to help reps turn cold leads into booked calls faster.';
  }
  if (DM_TIER2_REV.test(jt)) {
    return 'Position this as a cleaner system for tracking outbound, follow-ups, and pipeline movement.';
  }
  if (/demand gen|growth lead|head of growth|sdr/i.test(jt)) {
    return 'Position this as a tool to help SDRs personalize outreach at scale without spending hours on research.';
  }
  return 'Use direct outreach because the contact data appears strong and complete.';
}

function scoreLead(data: {
  companyName?: string;
  contactName?: string;
  industry?: string;
  companySize?: string;
  employeeCount?: string;
  jobTitle?: string;
  seniority?: string;
  contactEmail?: string;
  linkedinUrl?: string;
  companyWebsite?: string;
  companyLinkedin?: string;
  annualRevenue?: string;
  department?: string;
  technologies?: string[];
  notes?: string;
  enrichedAt?: string | null;
}): ScoreResult {
  const reasons: string[] = [];
  const buyingSignals: string[] = [];

  // ── 1. ICP Fit (0–30) ───────────────────────────────────────────────────────
  const industry = (data.industry || '').toLowerCase();
  let industryPts = 0;
  if (/software|technology|saas|information technology|internet|computer|tech/.test(industry)) {
    industryPts = 20; buyingSignals.push('Tech Industry');
  } else if (/financial|fintech|banking|insurance|investment|venture/.test(industry)) {
    industryPts = 16; buyingSignals.push('Finance/FinTech');
  } else if (/consulting|professional service|marketing|advertising|agency|staffing/.test(industry)) {
    industryPts = 14;
  } else if (/healthcare|medical|pharma|biotech|health/.test(industry)) {
    industryPts = 10;
  } else if (/education|legal|real estate|construction|manufacturing|retail/.test(industry)) {
    industryPts = 6;
  } else if (industry) {
    industryPts = 4;
  } else {
    industryPts = 2;
  }

  const empCount = parseEmployeeCount(data.companySize || data.employeeCount || '');
  let sizePts = 0;
  let sizeLabel = '';
  if (empCount >= 201 && empCount <= 1000) {
    sizePts = 10; sizeLabel = `${empCount} employees (ideal size)`;
    buyingSignals.push('Mid-Market');
  } else if (empCount >= 1001 && empCount <= 5000) {
    sizePts = 8; sizeLabel = `${empCount} employees`;
    buyingSignals.push('Mid-Market');
  } else if (empCount >= 5001) {
    sizePts = 5; sizeLabel = `${empCount} employees (enterprise)`;
    buyingSignals.push('Enterprise');
  } else if (empCount >= 51) {
    sizePts = 7; sizeLabel = `${empCount} employees`;
  } else if (empCount >= 11) {
    sizePts = 4; sizeLabel = `${empCount} employees`;
  } else if (empCount >= 1) {
    sizePts = 2; sizeLabel = `${empCount} employees (micro)`;
  }

  const icpFit = Math.min(30, industryPts + sizePts);
  const icpDetail = [data.industry ? data.industry : 'unknown industry', sizeLabel].filter(Boolean).join(' · ');
  reasons.push(`ICP Fit (${icpFit}/30): ${icpDetail || 'limited data'}`);

  // ── 2. Contact Quality (0–20) ────────────────────────────────────────────────
  const email = data.contactEmail || '';
  const personalDomains = /gmail\.|yahoo\.|hotmail\.|outlook\.|icloud\.|aol\.|protonmail\.|me\.com/i;
  let contactPts = 0;
  const contactDetails: string[] = [];

  if (email) {
    if (!personalDomains.test(email)) {
      contactPts += 8; contactDetails.push('Corporate email');
      buyingSignals.push('Corporate Email');
    } else {
      contactPts += 4; contactDetails.push('Personal email');
    }
    buyingSignals.push('Email Available');
  }
  if (data.contactEmail && data.notes?.includes('+1')) { /* phone from notes — skip */ }
  if (data.linkedinUrl) {
    contactPts += 4; contactDetails.push('LinkedIn');
    buyingSignals.push('LinkedIn Available');
  }
  if (data.companyWebsite) {
    contactPts += 4; contactDetails.push('Company website');
  }
  // phone — notes sometimes contain phone for enriched leads
  if (data.notes?.match(/\+\d[\d\s\-()]{7,}/)) {
    contactPts += 4; contactDetails.push('Phone number');
  }

  const contactQuality = Math.min(20, contactPts);
  reasons.push(`Contact Quality (${contactQuality}/20): ${contactDetails.join(' · ') || 'limited contact data'}`);

  // ── 3. Decision-Maker Fit (0–20) ─────────────────────────────────────────────
  const jt = data.jobTitle || '';
  let dmPts = 0;
  let dmLabel = '';

  if (DM_TIER1.test(jt)) {
    dmPts = 20; dmLabel = `${jt} — top-tier decision maker`;
    buyingSignals.push('Key Decision Maker');
  } else if (DM_TIER2_SALES.test(jt)) {
    dmPts = 17; dmLabel = `${jt} — revenue leader`;
    buyingSignals.push('Revenue Leader');
  } else if (DM_TIER2_REV.test(jt)) {
    dmPts = 15; dmLabel = `${jt} — revenue operations`;
    buyingSignals.push('Revenue Operations');
  } else if (/head of growth|growth lead|demand gen|sdr manager/i.test(jt)) {
    dmPts = 14; dmLabel = `${jt} — growth/demand leader`;
  } else if (DM_TIER3.test(jt)) {
    const isSalesAligned = /sales|revenue|growth|demand|marketing/i.test(jt);
    dmPts = isSalesAligned ? 12 : 10;
    dmLabel = `${jt}`;
    buyingSignals.push('Decision Maker');
  } else if (DM_TIER4.test(jt)) {
    const isSalesAligned = /sales|revenue|growth|demand/i.test(jt);
    dmPts = isSalesAligned ? 7 : 5;
    dmLabel = `${jt}`;
  } else if (data.seniority) {
    const sen = data.seniority.toLowerCase();
    if (['cxo', 'c-level', 'c-suite', 'executive'].includes(sen)) { dmPts = 10; dmLabel = `${data.seniority} seniority`; }
    else if (sen === 'vp') { dmPts = 12; dmLabel = `VP seniority`; }
    else if (sen === 'director') { dmPts = 10; dmLabel = `Director seniority`; }
    else if (sen === 'manager') { dmPts = 5; dmLabel = `Manager seniority`; }
    else if (sen === 'senior') { dmPts = 3; dmLabel = `Senior IC`; }
    else { dmPts = 2; dmLabel = `${data.seniority}`; }
  } else if (jt) {
    dmPts = 3; dmLabel = jt;
  } else {
    dmPts = 1; dmLabel = 'No title available';
  }

  const decisionMakerFit = Math.min(20, dmPts);
  reasons.push(`Decision-Maker (${decisionMakerFit}/20): ${dmLabel}`);

  // ── 4. Company Fit (0–15) ────────────────────────────────────────────────────
  let companyPts = 0;
  const companyDetails: string[] = [];
  if (data.companyWebsite) { companyPts += 5; companyDetails.push('Website'); }
  if (data.companyLinkedin) { companyPts += 4; companyDetails.push('LinkedIn'); }
  if (empCount > 0 || data.employeeCount) { companyPts += 3; companyDetails.push('Employee count'); }
  if (data.annualRevenue) { companyPts += 2; companyDetails.push('Revenue data'); }
  if (data.industry) { companyPts += 1; }

  const companyFit = Math.min(15, companyPts);
  reasons.push(`Company Fit (${companyFit}/15): ${companyDetails.join(' · ') || 'limited company data'}`);

  // ── 5. Recency / Data Freshness (0–15) ───────────────────────────────────────
  const age = daysSince(data.enrichedAt);
  let recencyPts = 0;
  let recencyLabel = '';

  if (age <= 7) {
    recencyPts = 15; recencyLabel = `Enriched ${Math.round(age)} day${age <= 1 ? '' : 's'} ago`;
  } else if (age <= 30) {
    recencyPts = 12; recencyLabel = `Enriched ${Math.round(age)} days ago`;
  } else if (age <= 90) {
    recencyPts = 8; recencyLabel = `Enriched ${Math.round(age)} days ago`;
  } else if (age < Infinity) {
    recencyPts = 4; recencyLabel = `Enriched ${Math.round(age / 30)} months ago`;
  } else if (email && jt) {
    recencyPts = 6; recencyLabel = 'Manual data — email + title present';
  } else if (email) {
    recencyPts = 4; recencyLabel = 'Manual data — email present';
  } else {
    recencyPts = 2; recencyLabel = 'No enrichment — enrich for higher score';
  }

  const recency = Math.min(15, recencyPts);
  reasons.push(`Data Freshness (${recency}/15): ${recencyLabel}`);

  // ── Final score ─────────────────────────────────────────────────────────────
  const intentScore = Math.max(0, Math.min(100, icpFit + contactQuality + decisionMakerFit + companyFit + recency));
  const label = getIntentLabel(intentScore);
  const recommendedAngle = getRecommendedAngle(jt);
  const signalType: SignalType = data.enrichedAt ? 'lusha_contact' : 'manual';
  const signalDate = data.enrichedAt || new Date().toISOString();

  // Legacy fields (backwards compat with callers that read these)
  const legacyRecommendations: string[] = [];
  if (intentScore >= 65) legacyRecommendations.push('High-intent lead — engage immediately');
  else if (intentScore >= 40) legacyRecommendations.push('Warm lead — add to outreach sequence');
  else legacyRecommendations.push('Cold lead — enrich data before outreach');
  if (!email) legacyRecommendations.push('Add email address to unlock direct outreach');
  if (!data.linkedinUrl) legacyRecommendations.push('Add LinkedIn URL for better enrichment');

  return {
    score: intentScore,
    intent_score: intentScore,
    icp_score: intentScore,
    enrichment_score: contactQuality + companyFit,
    intent_label: label,
    intent_reasons: reasons,
    recommended_angle: recommendedAngle,
    signal_type: signalType,
    signal_date: signalDate,
    reasoning: reasons.join(' · '),
    recommendations: legacyRecommendations.slice(0, 4),
    buying_signals: buyingSignals.length > 0 ? buyingSignals : ['Prospect'],
  };
}

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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    if (body.leadId) {
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
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const result = scoreLead({
        companyName:     lead.company_name,
        contactName:     lead.contact_name,
        industry:        lead.industry,
        companySize:     lead.company_size,
        employeeCount:   lead.employee_count,
        jobTitle:        lead.job_title,
        seniority:       lead.seniority,
        contactEmail:    lead.contact_email,
        linkedinUrl:     lead.linkedin_url,
        companyWebsite:  lead.company_website,
        companyLinkedin: lead.company_linkedin,
        annualRevenue:   lead.annual_revenue,
        department:      lead.department,
        technologies:    lead.technologies,
        notes:           lead.notes,
        enrichedAt:      lead.enriched_at,
      });

      // Persist all intent fields
      await supabaseService
        .from('leads')
        .update({
          icp_score:          result.score,
          intent_score:       result.intent_score,
          intent_label:       result.intent_label,
          intent_reasons:     result.intent_reasons,
          recommended_angle:  result.recommended_angle,
          signal_type:        result.signal_type,
          signal_date:        result.signal_date,
        })
        .eq('id', body.leadId)
        .eq('user_id', user.id);

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Direct field scoring (no DB persist)
    const validationErrors = validateInputs(body);
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ error: validationErrors.join(', ') }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = scoreLead({
      companyName:     body.companyName,
      contactName:     body.contactName,
      industry:        body.industry,
      companySize:     body.companySize,
      employeeCount:   body.employeeCount || body.employee_count,
      jobTitle:        body.jobTitle || body.job_title,
      seniority:       body.seniority,
      contactEmail:    body.contactEmail || body.contact_email,
      linkedinUrl:     body.linkedinUrl || body.linkedin_url,
      companyWebsite:  body.companyWebsite || body.company_website,
      companyLinkedin: body.companyLinkedin || body.company_linkedin,
      annualRevenue:   body.annualRevenue || body.annual_revenue,
      department:      body.department,
      technologies:    body.technologies,
      notes:           body.notes,
      enrichedAt:      body.enrichedAt || body.enriched_at || null,
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in score-lead function:', error);
    return new Response(
      JSON.stringify({
        error: 'Lead scoring temporarily unavailable',
        score: 50, intent_score: 50, icp_score: 50, enrichment_score: 20,
        intent_label: 'Warm', intent_reasons: ['Unable to score lead automatically'],
        recommended_angle: 'Review lead manually before outreach.',
        signal_type: 'manual', signal_date: new Date().toISOString(),
        reasoning: 'Unable to score lead automatically. Manual review recommended.',
        recommendations: ['Review lead manually', 'Add more information'],
        buying_signals: ['Prospect'],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
