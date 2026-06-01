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

async function prospeoRequest(apiKey: string, endpoint: string, body: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.prospeo.io/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-KEY': apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`Prospeo /${endpoint} returned ${res.status}:`, text);
    return null;
  }
  return res.json();
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
    const prospeoApiKey = Deno.env.get('PROSPEO_API_KEY');
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

    if (!prospeoApiKey) throw new Error('Prospeo API key not configured');

    const enrichmentData: Record<string, any> = {
      enrichment_status: 'enriched',
      enriched_at: new Date().toISOString(),
    };

    const nameIsTitle = isJobTitle(lead.contact_name);
    if (nameIsTitle) console.log('Detected job title as contact name:', lead.contact_name);

    // --- Person Enrichment via Prospeo ---
    let personFound = false;
    if (lead.linkedin_url || (!nameIsTitle && lead.contact_name)) {
      try {
        let personData: any = null;

        // Priority 1: LinkedIn URL → Prospeo linkedin-email-finder
        if (lead.linkedin_url) {
          const normalized = normalizeLinkedInUrl(lead.linkedin_url);
          if (normalized) {
            console.log('Prospeo linkedin-email-finder for:', normalized);
            personData = await prospeoRequest(prospeoApiKey, 'linkedin-email-finder', { url: normalized });
          }
        }

        // Priority 2: First + Last name + domain → Prospeo email-finder
        if (!personData && !nameIsTitle && lead.contact_name) {
          const parts = lead.contact_name.trim().split(/\s+/);
          if (parts.length >= 2) {
            // Resolve domain from website or email
            let domain = '';
            if (lead.company_website) {
              try {
                const u = new URL(lead.company_website.startsWith('http') ? lead.company_website : `https://${lead.company_website}`);
                domain = u.hostname.replace('www.', '');
              } catch { /* ignore */ }
            }
            if (!domain && lead.contact_email) {
              const d = lead.contact_email.split('@')[1];
              if (d && !FREE_EMAIL_DOMAINS.has(d)) domain = d;
            }
            if (!domain && lead.company_name) {
              // Use company name as last resort — Prospeo supports it
              domain = lead.company_name;
            }
            if (domain) {
              console.log('Prospeo email-finder for:', parts[0], parts.slice(1).join(' '), 'at', domain);
              personData = await prospeoRequest(prospeoApiKey, 'email-finder', {
                first_name: parts[0],
                last_name: parts.slice(1).join(' '),
                company: domain,
              });
            }
          }
        }

        if (personData && !personData.error) {
          const p = personData.response ?? personData;
          personFound = true;

          // Email
          const email = p.email?.value ?? p.email;
          if (email && !lead.contact_email) enrichmentData.contact_email = email;

          // Name
          const fullName = [p.first_name, p.last_name].filter(Boolean).join(' ');
          if (nameIsTitle && fullName) enrichmentData.contact_name = fullName;
          else if (fullName && !lead.contact_name) enrichmentData.contact_name = fullName;

          // Job info
          if (p.job_title) enrichmentData.job_title = p.job_title;
          if (p.seniority) enrichmentData.seniority = p.seniority;
          if (p.linkedin_url) enrichmentData.linkedin_url = normalizeLinkedInUrl(p.linkedin_url) || p.linkedin_url;

          // Company info returned alongside person
          if (p.company_name && !lead.company_name) enrichmentData.company_name = p.company_name;
          if (p.company?.size) enrichmentData.employee_count = p.company.size;
          if (p.company?.industry) enrichmentData.industry = p.company.industry;
        }
      } catch (personErr) {
        console.error('Person enrichment error:', personErr);
      }
    }

    // --- Company Enrichment via Prospeo domain-search ---
    if (!personFound && (lead.company_website || lead.contact_email || lead.company_name)) {
      try {
        let domain = '';
        if (lead.company_website) {
          try {
            const u = new URL(lead.company_website.startsWith('http') ? lead.company_website : `https://${lead.company_website}`);
            domain = u.hostname.replace('www.', '');
          } catch { /* ignore */ }
        }
        if (!domain && lead.contact_email) {
          const d = lead.contact_email.split('@')[1];
          if (d && !FREE_EMAIL_DOMAINS.has(d)) domain = d;
        }

        if (domain) {
          console.log('Prospeo domain-search for:', domain);
          const companyData = await prospeoRequest(prospeoApiKey, 'domain-search', { company: domain });
          if (companyData && !companyData.error) {
            const c = companyData.response ?? companyData;
            if (c.emails?.length && !lead.contact_email) {
              enrichmentData.contact_email = c.emails[0].email ?? c.emails[0];
            }
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
