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

function isJobTitle(name: string): boolean {
  const trimmed = name.trim();
  // Single word that matches a known title
  if (!trimmed.includes(' ') && JOB_TITLE_PATTERNS.has(trimmed.toLowerCase())) {
    return true;
  }
  // Multi-word patterns like "Co-Founder", "VP Sales", "Head of Engineering"
  const lower = trimmed.toLowerCase();
  if (/^(co-?founder|vice president|head of|chief .+ officer)$/i.test(lower)) {
    return true;
  }
  return false;
}

function normalizeLinkedInUrl(url: string | null): string | null {
  if (!url) return null;
  let cleaned = url.trim();
  // Ensure it starts with https://
  if (!cleaned.startsWith('http')) {
    cleaned = 'https://' + cleaned;
  }
  try {
    const parsed = new URL(cleaned);
    // Check if it's a LinkedIn URL
    if (!parsed.hostname.includes('linkedin.com')) return cleaned;
    // Always normalize to www.linkedin.com (handles country-specific subdomains like uk.linkedin.com, de.linkedin.com)
    const path = parsed.pathname.replace(/\/+$/, ''); // remove trailing slashes
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
    
    if (!leadId) {
      throw new Error('Lead ID is required');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const pdlApiKey = Deno.env.get('PDL_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    console.log('Enriching lead for user:', user.id);

    // Check if user is admin (bypass plan checks)
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    const isAdmin = adminRole?.role === 'admin';

    // CRITICAL: Block free-tier users from enrichment
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

      // Check credits before enrichment
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

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .eq('user_id', user.id)
      .single();

    if (leadError || !lead) {
      throw new Error('Lead not found');
    }

    console.log('Enriching lead:', lead.contact_name, lead.company_name);

    if (!pdlApiKey) {
      throw new Error('PDL API key not configured');
    }

    const enrichmentData: Record<string, any> = {
      enrichment_status: 'enriched',
      enriched_at: new Date().toISOString(),
    };

    const nameIsTitle = isJobTitle(lead.contact_name);
    if (nameIsTitle) {
      console.log('Detected job title as contact name:', lead.contact_name);
    }

    // --- Person Enrichment via PDL ---
    let personFound = false;
    if (lead.contact_email || lead.linkedin_url || (!nameIsTitle && lead.contact_name)) {
      try {
        const personParams: Record<string, string> = {};
        
        // Priority 1: Email (strongest identifier)
        if (lead.contact_email) personParams.email = lead.contact_email;
        
        // Priority 2: LinkedIn URL (normalize it)
        if (lead.linkedin_url) {
          const normalized = normalizeLinkedInUrl(lead.linkedin_url);
          if (normalized) personParams.profile = normalized;
        }
        
        // Priority 3: Name + Company (only if name is not a job title)
        if (!nameIsTitle && lead.contact_name) {
          const parts = lead.contact_name.trim().split(/\s+/);
          if (parts.length >= 2) {
            personParams.first_name = parts[0];
            personParams.last_name = parts.slice(1).join(' ');
          } else if (parts.length === 1 && parts[0].length > 1) {
            // Single word that's not a job title - try as first name with company
            personParams.first_name = parts[0];
          }
        }
        if (lead.company_name) personParams.company = lead.company_name;

        // Only call PDL if we have at least one strong identifier
        if (personParams.email || personParams.profile || (personParams.first_name && personParams.company)) {
          const qs = new URLSearchParams(personParams).toString();
          console.log('PDL person params:', Object.keys(personParams).join(', '));
          
          const personRes = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${qs}`, {
            headers: { 'X-Api-Key': pdlApiKey },
          });

          if (personRes.ok) {
            const person = await personRes.json();
            if (person && person.status === 200 && person.data) {
              personFound = true;
              const p = person.data;
              
              // Update contact name if current one is a job title and PDL has a real name
              if (nameIsTitle && p.full_name) {
                enrichmentData.contact_name = p.full_name;
              } else if (p.full_name && !lead.contact_name) {
                enrichmentData.contact_name = p.full_name;
              }
              
              if (p.job_title) enrichmentData.job_title = p.job_title;
              if (p.job_title_role) enrichmentData.department = p.job_title_role;
              if (p.job_title_levels?.length) enrichmentData.seniority = p.job_title_levels[0];
              if (p.linkedin_url) enrichmentData.linkedin_url = normalizeLinkedInUrl(p.linkedin_url) || p.linkedin_url;
              if (p.work_email && !lead.contact_email) enrichmentData.contact_email = p.work_email;
              if (!enrichmentData.contact_email && p.recommended_personal_email && !lead.contact_email) {
                enrichmentData.contact_email = p.recommended_personal_email;
              }
              if (p.phone_numbers?.length && !lead.contact_phone) enrichmentData.contact_phone = p.phone_numbers[0];
              if (p.location_name) enrichmentData.notes = (lead.notes ? lead.notes + '\n' : '') + `Location: ${p.location_name}`;
            }
          } else {
            const errText = await personRes.text();
            console.warn('PDL person enrich returned', personRes.status, errText);
          }
        } else {
          console.warn('Skipping person enrichment: insufficient identifiers');
        }
      } catch (personErr) {
        console.error('Person enrichment error:', personErr);
      }
    }

    // --- Company Enrichment via PDL ---
    if (lead.company_name || lead.company_website || lead.contact_email) {
      try {
        const companyParams: Record<string, string> = {};
        
        // Try website first
        if (lead.company_website) {
          try {
            const url = new URL(lead.company_website.startsWith('http') ? lead.company_website : `https://${lead.company_website}`);
            companyParams.website = url.hostname.replace('www.', '');
          } catch { /* ignore bad URL */ }
        }
        
        // Try deriving domain from email if no website
        if (!companyParams.website && lead.contact_email) {
          const emailDomain = lead.contact_email.split('@')[1];
          if (emailDomain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com'].includes(emailDomain)) {
            companyParams.website = emailDomain;
          }
        }
        
        if (!companyParams.website && lead.company_name) {
          companyParams.name = lead.company_name;
        }

        if (Object.keys(companyParams).length > 0) {
          const qs = new URLSearchParams(companyParams).toString();
          const companyRes = await fetch(`https://api.peopledatalabs.com/v5/company/enrich?${qs}`, {
            headers: { 'X-Api-Key': pdlApiKey },
          });

          if (companyRes.ok) {
            const company = await companyRes.json();
            if (company && company.status === 200 && company.data) {
              const c = company.data;
              if (c.website && !lead.company_website) enrichmentData.company_website = c.website;
              if (c.linkedin_url) enrichmentData.company_linkedin = normalizeLinkedInUrl(c.linkedin_url) || c.linkedin_url;
              if (c.industry) enrichmentData.industry = c.industry;
              if (c.summary) enrichmentData.company_description = c.summary;
              if (c.employee_count) enrichmentData.employee_count = String(c.employee_count);
              if (c.estimated_annual_revenue) enrichmentData.annual_revenue = c.estimated_annual_revenue;
              if (c.tags?.length) {
                enrichmentData.technologies = c.tags.slice(0, 20);
              }
            }
          } else {
            console.warn('PDL company enrich returned', companyRes.status, await companyRes.text());
          }
        }
      } catch (companyErr) {
        console.error('Company enrichment error:', companyErr);
      }
    }

    // Check if we actually enriched anything beyond the status fields
    const enrichedFields = Object.keys(enrichmentData).filter(k => k !== 'enrichment_status' && k !== 'enriched_at');
    
    let noMatchReason = '';
    if (enrichedFields.length === 0) {
      enrichmentData.enrichment_status = 'failed';
      // Build a helpful reason
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

    // Update lead
    const { error: updateError } = await supabase
      .from('leads')
      .update(enrichmentData)
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (updateError) {
      throw updateError;
    }

    console.log('Lead enriched successfully:', leadId, 'fields:', enrichedFields);

    // Log enrichment history
    await supabase
      .from('enrichment_history')
      .insert({
        lead_id: leadId,
        user_id: user.id,
        fields_enriched: enrichedFields,
        source: 'peopledatalabs',
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
