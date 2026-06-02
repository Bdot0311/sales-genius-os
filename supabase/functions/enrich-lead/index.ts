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

function normalizeLinkedInUrl(url: string | null): string | null {
  if (!url) return null;
  let cleaned = url.trim();
  if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
  try {
    const parsed = new URL(cleaned);
    if (!parsed.hostname.includes('linkedin.com')) return cleaned;
    const path = parsed.pathname.replace(/\/+$/, '');
    return `https://www.linkedin.com${path}`;
  } catch {
    return cleaned;
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

      if ((subscription.search_credits_remaining || 0) <= 0) {
        return new Response(
          JSON.stringify({
            error: 'No search credits remaining. Add more credits to enrich leads.',
            error_code: 'credits_exhausted',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (leadError || !lead) throw new Error('Lead not found');

    console.log('Enriching lead:', lead.contact_name, lead.company_name);

    if (!railwayBaseUrl) throw new Error('Railway API not configured');

    const baseUrl = railwayBaseUrl.replace(/\/+$/, '').replace(/\/(search|docs|health)$/, '');
    const enrichUrl = `${baseUrl}/enrich`;

    const nameIsTitle = isJobTitle(lead.contact_name);

    // Build enrich request payload
    const enrichPayload: Record<string, string> = {};

    if (lead.linkedin_url) {
      const normalized = normalizeLinkedInUrl(lead.linkedin_url);
      if (normalized) enrichPayload.linkedin_url = normalized;
    }
    if (lead.contact_email) enrichPayload.email = lead.contact_email;
    if (!nameIsTitle && lead.contact_name) {
      const parts = lead.contact_name.trim().split(/\s+/);
      if (parts.length >= 2) {
        enrichPayload.first_name = parts[0];
        enrichPayload.last_name = parts.slice(1).join(' ');
      }
    }
    if (lead.company_name) enrichPayload.company = lead.company_name;
    if (lead.company_website) {
      try {
        const u = new URL(lead.company_website.startsWith('http') ? lead.company_website : `https://${lead.company_website}`);
        enrichPayload.domain = u.hostname.replace('www.', '');
      } catch { /* ignore */ }
    }
    if (!enrichPayload.domain && lead.contact_email) {
      const d = lead.contact_email.split('@')[1];
      if (d && !FREE_EMAIL_DOMAINS.has(d)) enrichPayload.domain = d;
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

    const enrichmentData: Record<string, any> = {
      enrichment_status: 'enriched',
      enriched_at: new Date().toISOString(),
    };

    if (railwayData && !railwayData.error) {
      const p = railwayData.person ?? railwayData.contact ?? railwayData.response ?? railwayData;
      const c = railwayData.company ?? p?.company ?? {};

      // Person fields
      const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ') || p.full_name || p.name;
      if (nameIsTitle && fullName) enrichmentData.contact_name = fullName;
      else if (fullName && !lead.contact_name) enrichmentData.contact_name = fullName;

      const email = p.email?.value ?? p.email ?? p.business_email;
      if (email && !lead.contact_email) enrichmentData.contact_email = email;

      if (p.job_title || p.title) enrichmentData.job_title = p.job_title ?? p.title;
      if (p.seniority) enrichmentData.seniority = p.seniority;
      if (p.linkedin_url || p.linkedInUrl) {
        enrichmentData.linkedin_url = normalizeLinkedInUrl(p.linkedin_url ?? p.linkedInUrl);
      }
      if (p.phone || p.phone_number) enrichmentData.contact_phone = p.phone ?? p.phone_number;

      // Company fields
      if (c.website && !lead.company_website) enrichmentData.company_website = c.website;
      if (c.industry) enrichmentData.industry = c.industry;
      if (c.size || c.employee_count || c.employeeRange) {
        enrichmentData.employee_count = String(c.size ?? c.employee_count ?? c.employeeRange);
      }
      if (c.linkedin_url || c.linkedInUrl) {
        enrichmentData.company_linkedin = normalizeLinkedInUrl(c.linkedin_url ?? c.linkedInUrl);
      }
      if (c.description) enrichmentData.company_description = c.description;
      if (c.technologies?.length) enrichmentData.technologies = c.technologies.slice(0, 20);
    }

    const enrichedFields = Object.keys(enrichmentData).filter(
      (k) => k !== 'enrichment_status' && k !== 'enriched_at'
    );

    let noMatchReason = '';
    if (enrichedFields.length === 0) {
      enrichmentData.enrichment_status = 'failed';
      const hasEmail = !!lead.contact_email;
      const hasLinkedin = !!lead.linkedin_url;
      const hasRealName = !nameIsTitle && lead.contact_name?.trim().split(/\s+/).length >= 2;

      if (!hasEmail && !hasLinkedin && !hasRealName) {
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
    }

    console.log('Lead enriched successfully:', leadId, 'fields:', enrichedFields);

    await supabase.from('enrichment_history').insert({
      lead_id: leadId,
      user_id: user.id,
      fields_enriched: enrichedFields,
      source: 'prospeo',
      status: enrichedFields.length > 0 ? 'success' : 'no_match',
      error_message: noMatchReason || null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: enrichedFields.length > 0 ? 'Lead enriched successfully' : noMatchReason,
        enrichedFields,
        noMatch: enrichedFields.length === 0,
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
