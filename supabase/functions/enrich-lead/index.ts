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
  if (!trimmed.includes(' ') && JOB_TITLE_PATTERNS.has(trimmed.toLowerCase())) {
    return true;
  }
  if (/^(co-?founder|vice president|head of|chief .+ officer)$/i.test(trimmed)) {
    return true;
  }
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
    const lushaApiKey = Deno.env.get('LUSHA_API_KEY');
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
        console.log('Free tier user blocked from enrichment:', { userId: user.id });
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

    if (!lushaApiKey) throw new Error('Lusha API key not configured');

    const enrichmentData: Record<string, any> = {
      enrichment_status: 'enriched',
      enriched_at: new Date().toISOString(),
    };

    const nameIsTitle = isJobTitle(lead.contact_name);
    if (nameIsTitle) console.log('Detected job title as contact name:', lead.contact_name);

    // --- Person Enrichment via Lusha ---
    let personFound = false;
    if (lead.contact_email || lead.linkedin_url || (!nameIsTitle && lead.contact_name)) {
      try {
        const personParams: Record<string, string> = {};

        // Priority 1: LinkedIn URL
        if (lead.linkedin_url) {
          const normalized = normalizeLinkedInUrl(lead.linkedin_url);
          if (normalized) personParams.linkedInUrl = normalized;
        }

        // Priority 2: Email address
        if (lead.contact_email) personParams.emailAddress = lead.contact_email;

        // Priority 3: Name + Company (only if name is not a job title)
        if (!nameIsTitle && lead.contact_name) {
          const parts = lead.contact_name.trim().split(/\s+/);
          if (parts.length >= 2) {
            personParams.firstName = parts[0];
            personParams.lastName = parts.slice(1).join(' ');
          } else if (parts.length === 1 && parts[0].length > 1) {
            personParams.firstName = parts[0];
          }
        }
        if (lead.company_name) personParams.company = lead.company_name;

        if (personParams.linkedInUrl || personParams.emailAddress || (personParams.firstName && personParams.company)) {
          const qs = new URLSearchParams(personParams).toString();
          console.log('Lusha person params:', Object.keys(personParams).join(', '));

          const personRes = await fetch(`https://api.lusha.com/contacts?${qs}`, {
            headers: { 'api_key': lushaApiKey },
          });

          if (personRes.ok) {
            const json = await personRes.json();
            const p = json?.data ?? json;
            if (p && (p.firstName || p.fullName || p.emailAddresses?.length)) {
              personFound = true;

              const fullName = p.fullName ?? [p.firstName, p.lastName].filter(Boolean).join(' ');
              if (nameIsTitle && fullName) {
                enrichmentData.contact_name = fullName;
              } else if (fullName && !lead.contact_name) {
                enrichmentData.contact_name = fullName;
              }

              if (p.title) enrichmentData.job_title = p.title;
              if (p.department) enrichmentData.department = p.department;
              if (p.seniority) enrichmentData.seniority = p.seniority;
              if (p.linkedInUrl) enrichmentData.linkedin_url = normalizeLinkedInUrl(p.linkedInUrl) || p.linkedInUrl;

              // Pick best email: professional first, then personal
              const emails: Array<{ value: string; type?: string }> = p.emailAddresses ?? [];
              if (emails.length && !lead.contact_email) {
                const professional = emails.find((e) => e.type === 'professional' || e.type === 'work');
                enrichmentData.contact_email = (professional ?? emails[0]).value;
              }

              // Pick best phone
              const phones: Array<{ localizedNumber?: string; number?: string }> = p.phoneNumbers ?? [];
              if (phones.length && !lead.contact_phone) {
                enrichmentData.contact_phone = phones[0].localizedNumber ?? phones[0].number;
              }

              if (p.location) {
                enrichmentData.notes = (lead.notes ? lead.notes + '\n' : '') + `Location: ${p.location}`;
              }
            }
          } else {
            const errText = await personRes.text();
            console.warn('Lusha person enrich returned', personRes.status, errText);
          }
        } else {
          console.warn('Skipping person enrichment: insufficient identifiers');
        }
      } catch (personErr) {
        console.error('Person enrichment error:', personErr);
      }
    }

    // --- Company Enrichment via Lusha ---
    if (lead.company_name || lead.company_website || lead.contact_email) {
      try {
        const companyParams: Record<string, string> = {};

        // Prefer domain over name
        if (lead.company_website) {
          try {
            const url = new URL(lead.company_website.startsWith('http') ? lead.company_website : `https://${lead.company_website}`);
            companyParams.domain = url.hostname.replace('www.', '');
          } catch { /* ignore bad URL */ }
        }

        if (!companyParams.domain && lead.contact_email) {
          const emailDomain = lead.contact_email.split('@')[1];
          if (emailDomain && !FREE_EMAIL_DOMAINS.has(emailDomain)) {
            companyParams.domain = emailDomain;
          }
        }

        if (!companyParams.domain && lead.company_name) {
          companyParams.name = lead.company_name;
        }

        if (Object.keys(companyParams).length > 0) {
          const qs = new URLSearchParams(companyParams).toString();
          const companyRes = await fetch(`https://api.lusha.com/company?${qs}`, {
            headers: { 'api_key': lushaApiKey },
          });

          if (companyRes.ok) {
            const json = await companyRes.json();
            const c = json?.data ?? json;
            if (c) {
              if (c.website && !lead.company_website) enrichmentData.company_website = c.website;
              if (c.linkedInUrl) enrichmentData.company_linkedin = normalizeLinkedInUrl(c.linkedInUrl) || c.linkedInUrl;
              if (c.industry) enrichmentData.industry = c.industry;
              if (c.description) enrichmentData.company_description = c.description;
              // Lusha returns employeeRange ("51-200") and/or employeeCount (number)
              if (c.employeeRange) enrichmentData.employee_count = c.employeeRange;
              else if (c.employeeCount) enrichmentData.employee_count = String(c.employeeCount);
              if (c.annualRevenue) enrichmentData.annual_revenue = c.annualRevenue;
              if (c.technologies?.length) enrichmentData.technologies = c.technologies.slice(0, 20);
            }
          } else {
            console.warn('Lusha company enrich returned', companyRes.status, await companyRes.text());
          }
        }
      } catch (companyErr) {
        console.error('Company enrichment error:', companyErr);
      }
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
        noMatchReason = `"${lead.contact_name}" looks like a job title, not a person's name. Add an email or LinkedIn URL to identify this contact.`;
      } else {
        noMatchReason = 'No matching records found in our data providers. Try adding more contact details.';
      }
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(enrichmentData)
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (updateError) throw updateError;

    // Delegate scoring to score-lead (5-category intent scoring)
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
        if (!scoreRes.ok) {
          console.error('score-lead returned', scoreRes.status, await scoreRes.text());
        } else {
          console.log('Lead scored after enrichment:', leadId);
        }
      } catch (scoreErr) {
        console.error('Error calling score-lead after enrichment:', scoreErr);
      }
    }

    console.log('Lead enriched successfully:', leadId, 'fields:', enrichedFields);

    await supabase.from('enrichment_history').insert({
      lead_id: leadId,
      user_id: user.id,
      fields_enriched: enrichedFields,
      source: 'lusha',
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
