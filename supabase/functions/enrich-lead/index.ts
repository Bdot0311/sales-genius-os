import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JOB_TITLE_PATTERNS = new Set([
  'founder', 'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'cso',
  'director', 'manager', 'engineer', 'designer', 'vp', 'president',
  'owner', 'partner', 'associate', 'analyst', 'consultant', 'architect',
  'lead', 'head', 'chief', 'officer', 'supervisor', 'coordinator',
  'specialist', 'developer', 'administrator', 'executive', 'intern',
]);

const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com',
]);

function isJobTitle(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed.includes(' ') && JOB_TITLE_PATTERNS.has(trimmed.toLowerCase())) return true;
  if (/^(co-?founder|vice president|head of|chief .+ officer)$/i.test(trimmed)) return true;
  return false;
}

function normalizeLinkedInUrl(url: string | null, kind: 'profile' | 'company' = 'profile'): string | null {
  if (!url) return null;
  let cleaned = url.trim();
  if (!cleaned || cleaned.toLowerCase() === 'linkedin') return null;
  if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
  try {
    const parsed = new URL(cleaned);
    if (!parsed.hostname.includes('linkedin.com')) return null;
    const path = parsed.pathname.replace(/\/+$/, '');
    const expected = kind === 'company' ? /^\/(company|school)\/[^/]+/ : /^\/(in|pub)\/[^/]+/;
    if (!expected.test(path)) return null;
    return `https://www.linkedin.com${path}`;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId } = await req.json();
    if (!leadId) throw new Error('Lead ID is required');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const railwayBaseUrl = Deno.env.get('RAILWAY_LEADS_API_URL');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) throw new Error('Invalid user token');

    console.log('Enriching lead for user:', user.id);

    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = adminRole?.role === 'admin';

    let creditWasDeducted = false;
    if (!isAdmin) {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan, status, search_credits_remaining')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!subscription || subscription.plan === 'free') {
        return new Response(
          JSON.stringify({
            error: 'Lead enrichment requires a paid plan. Upgrade to Growth ($49/mo) to unlock enrichment.',
            error_code: 'free_tier_blocked',
            upgrade_plan: 'growth',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const remaining = subscription.search_credits_remaining || 0;
      if (remaining <= 0) {
        return new Response(
          JSON.stringify({
            error: 'No search credits remaining. Add more credits to enrich leads.',
            error_code: 'credits_exhausted',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Deduct 1 credit up-front; refunded below on no-match / failure.
      const { error: deductError } = await supabase
        .from('subscriptions')
        .update({ search_credits_remaining: remaining - 1 })
        .eq('user_id', user.id);
      if (deductError) {
        console.error('Enrich credit deduction failed:', deductError);
        throw new Error('Failed to reserve credit for enrichment');
      }
      creditWasDeducted = true;
      await supabase.from('search_transactions').insert({
        user_id: user.id,
        type: 'usage',
        amount: -1,
        balance_after: remaining - 1,
        description: 'Lead enrichment',
      });
    }

    const refundCredit = async (reason: string) => {
      if (!creditWasDeducted) return;
      creditWasDeducted = false;
      try {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('search_credits_remaining')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!sub) return;
        const restored = (sub.search_credits_remaining || 0) + 1;
        await supabase
          .from('subscriptions')
          .update({ search_credits_remaining: restored })
          .eq('user_id', user.id);
        await supabase.from('search_transactions').insert({
          user_id: user.id,
          type: 'refund',
          amount: 1,
          balance_after: restored,
          description: `Enrichment refund: ${reason}`,
        });
      } catch (e) {
        console.error('Enrich credit refund failed:', e);
      }
    };

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (leadError || !lead) {
      await refundCredit('lead_not_found');
      throw new Error('Lead not found');
    }

    console.log('Enriching lead:', lead.contact_name, lead.company_name);

    if (!railwayBaseUrl) throw new Error('Railway API not configured');

    const baseUrl = railwayBaseUrl.replace(/\/+$/, '').replace(/\/(search|docs|health)$/, '');
    const enrichUrl = `${baseUrl}/enrich`;

    const nameIsTitle = isJobTitle(lead.contact_name);

    // Build enrich request payload. Railway (Wiza-backed) accepts EXACTLY ONE of:
    //   (a) linkedin_url, (b) email, or (c) full_name + company.
    // We prefer full_name+company (highest match rate), then email, then linkedin_url.
    const enrichPayload: Record<string, string> = {};

    const normalizedLinkedin = lead.linkedin_url ? normalizeLinkedInUrl(lead.linkedin_url) : null;
    const looksLikeLinkedinProfile = !!normalizedLinkedin
      && /linkedin\.com\/in\/[^/]+/.test(normalizedLinkedin);

    const fullName = (!nameIsTitle && lead.contact_name && lead.contact_name.trim().split(/\s+/).length >= 2)
      ? lead.contact_name.trim()
      : null;

    if (fullName && lead.company_name) {
      enrichPayload.full_name = fullName;
      enrichPayload.company = lead.company_name;
    } else if (lead.contact_email) {
      enrichPayload.email = lead.contact_email;
    } else if (looksLikeLinkedinProfile) {
      enrichPayload.linkedin_url = normalizedLinkedin!;
    }





    console.log('Calling Railway /enrich with:', Object.keys(enrichPayload).join(', '));

    const railwayApiKey = Deno.env.get('RAILWAY_API_KEY');
    const enrichHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
    if (railwayApiKey) {
      enrichHeaders['Authorization'] = `Bearer ${railwayApiKey}`;
      enrichHeaders['X-API-Key'] = railwayApiKey;
    }

    let railwayData: any = null;
    try {
      const res = await fetch(enrichUrl, {
        method: 'POST',
        headers: enrichHeaders,
        body: JSON.stringify(enrichPayload),
      });
      console.log('Railway /enrich status:', res.status);
      if (res.ok) {
        railwayData = await res.json();
        console.log('Railway /enrich response keys:', Object.keys(railwayData || {}));
      } else {
        const errText = await res.text();
        console.warn('Railway /enrich error:', res.status, errText);
      }
    } catch (fetchErr) {
      console.error('Railway /enrich fetch failed:', fetchErr);
    }

    let countryToStore: string | null = null;
    const enrichmentData: Record<string, any> = {
      enrichment_status: 'enriched',
      enriched_at: new Date().toISOString(),
    };

    if (railwayData && !railwayData.error) {
      // Railway returns { lead: {...} } or legacy { person, company } / flat shapes.
      const root = railwayData.lead ?? railwayData;
      const p = root.person ?? root.contact ?? root.response ?? root;
      const c = root.company ?? p?.company ?? root;

      // Person fields
      const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ')
        || p.full_name || p.name || p.contact_name;
      if (nameIsTitle && fullName) enrichmentData.contact_name = fullName;
      else if (fullName && !lead.contact_name) enrichmentData.contact_name = fullName;

      const email = p.email?.value ?? p.email ?? p.business_email;
      if (email && !lead.contact_email) enrichmentData.contact_email = email;

      if (p.job_title || p.title) enrichmentData.job_title = p.job_title ?? p.title;
      if (p.seniority) enrichmentData.seniority = p.seniority;
      if (p.linkedin_url || p.linkedInUrl) {
        const norm = normalizeLinkedInUrl(p.linkedin_url ?? p.linkedInUrl, 'profile');
        if (norm) enrichmentData.linkedin_url = norm;
      }
      if (p.phone || p.phone_number || p.mobile_phone) {
        enrichmentData.contact_phone = p.phone ?? p.phone_number ?? p.mobile_phone;
      }
      // Country feeds the geography fit dimension in lead scoring. Written
      // separately below (best-effort) so a missing column can't break enrichment.
      const rawCountry = p.country ?? p.location_country ?? p.country_code ?? p.location
        ?? c.country ?? root.country ?? null;
      if (typeof rawCountry === 'string' && rawCountry.trim()) {
        countryToStore = rawCountry.trim().slice(0, 100);
      }

      // Company fields
      const companyName = c.name ?? c.company_name ?? root.company_name;
      if (companyName && !lead.company_name) enrichmentData.company_name = companyName;
      const website = c.website ?? c.domain ?? root.company_domain;
      if (website && !lead.company_website) {
        enrichmentData.company_website = website.startsWith('http') ? website : `https://${website}`;
      }
      const industry = c.industry ?? root.industry ?? root.company_industry;
      if (industry) enrichmentData.industry = industry;
      const size = c.size ?? c.employee_count ?? c.employeeRange ?? root.company_size;
      if (size) enrichmentData.employee_count = String(size);
      if (c.linkedin_url || c.linkedInUrl) {
        const norm = normalizeLinkedInUrl(c.linkedin_url ?? c.linkedInUrl, 'company');
        if (norm) enrichmentData.company_linkedin = norm;
      }
      const desc = c.description ?? root.company_description;
      if (desc) enrichmentData.company_description = desc;
      const techs = c.technologies ?? root.technologies;
      if (Array.isArray(techs) && techs.length) enrichmentData.technologies = techs.slice(0, 20);
    }
    console.log('Mapped enrichmentData:', JSON.stringify(enrichmentData));
    if (railwayData) console.log('Raw Railway lead:', JSON.stringify(railwayData).slice(0, 800));



    const enrichedFields = Object.keys(enrichmentData).filter(
      (k) => k !== 'enrichment_status' && k !== 'enriched_at'
    );

    let noMatchReason = '';
    if (enrichedFields.length === 0) {
      const alreadyEnriched = lead.enrichment_status === 'enriched' || !!lead.enriched_at;
      enrichmentData.enrichment_status = alreadyEnriched ? 'enriched' : 'failed';
      const hasEmail = !!lead.contact_email;
      const hasLinkedin = !!lead.linkedin_url;
      const hasRealName = !nameIsTitle && lead.contact_name?.trim().split(/\s+/).length >= 2;

      if (alreadyEnriched) {
        noMatchReason = 'Lead is already up-to-date. No new enrichment fields were found.';
      } else if (!hasEmail && !hasLinkedin && !hasRealName) {
        noMatchReason = 'Not enough identifying data. Add a full name, email address, or LinkedIn URL and try again.';
      } else if (nameIsTitle && !hasEmail && !hasLinkedin) {
        noMatchReason = `"${lead.contact_name}" looks like a job title. Add an email or LinkedIn URL to identify this contact.`;
      } else {
        noMatchReason = 'No matching records found. Try adding more contact details.';
      }
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(enrichmentData)
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    // Best-effort country write for geography scoring. Kept out of the main
    // update so that on a DB where the column has not been added yet, a failure
    // here logs and moves on instead of failing the whole enrichment.
    if (countryToStore) {
      const { error: countryErr } = await supabase
        .from('leads')
        .update({ country: countryToStore })
        .eq('id', leadId)
        .eq('user_id', user.id);
      if (countryErr) console.warn('country write skipped (column may not exist yet):', countryErr.message);
    }

    if (enrichedFields.length > 0) {
      try {
        const scoreRes = await fetch(`${supabaseUrl}/functions/v1/score-lead`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({ leadId }),
        });
        if (!scoreRes.ok) console.error('score-lead returned', scoreRes.status);
        else console.log('Lead scored after enrichment:', leadId);
      } catch (scoreErr) {
        console.error('Error calling score-lead after enrichment:', scoreErr);
      }

      // Detect real buying signals from the company's public ATS board (free,
      // no setup) BEFORE v2 scores, so a live hiring event is folded into intent
      // on this same pass. Non-blocking: a miss just leaves the quality baseline.
      try {
        const sigRes = await fetch(`${supabaseUrl}/functions/v1/detect-hiring-signals`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({ leadId }),
        });
        if (!sigRes.ok) console.error('detect-hiring-signals returned', sigRes.status);
      } catch (sigErr) {
        console.error('Error calling detect-hiring-signals after enrichment:', sigErr);
      }

      // Also run Lead Score v2 so the A/B/C tier (and fit/intent breakdown the
      // Leads table reads) is populated automatically on enrichment. Kept
      // separate from score-lead above: v1 writes icp_score, v2 writes tier.
      // Non-blocking and gated to paid plans server-side; failures are logged.
      try {
        const tierRes = await fetch(`${supabaseUrl}/functions/v1/score-lead-v2`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({ leadId }),
        });
        if (!tierRes.ok) console.error('score-lead-v2 returned', tierRes.status);
        else console.log('Lead tiered after enrichment:', leadId);
      } catch (tierErr) {
        console.error('Error calling score-lead-v2 after enrichment:', tierErr);
      }
    }

    console.log('Lead enriched successfully:', leadId, 'fields:', enrichedFields);

    if (enrichedFields.length === 0) {
      await refundCredit(noMatchReason || 'no_match');
    }

    await supabase.from('enrichment_history').insert({
      lead_id: leadId,
      user_id: user.id,
      fields_enriched: enrichedFields,
      source: 'railway',
      status: enrichedFields.length > 0 ? 'success' : 'no_match',
      error_message: noMatchReason || null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: enrichedFields.length > 0 ? 'Lead enriched successfully' : noMatchReason,
        enrichedFields,
        noMatch: enrichedFields.length === 0,
        alreadyUpToDate: enrichedFields.length === 0 && (lead.enrichment_status === 'enriched' || !!lead.enriched_at),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enrich-lead function:', error);
    const errorMsg = error instanceof Error ? error.message : '';
    const isAuthError = errorMsg.includes('authorization') || errorMsg.includes('token') || errorMsg.includes('No authorization');
    const isNotFound = errorMsg.includes('not found');

    return new Response(
      JSON.stringify({
        error: isAuthError ? 'Authentication required' : isNotFound ? 'Resource not found' : 'Operation failed',
      }),
      {
        status: isAuthError ? 401 : isNotFound ? 404 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
