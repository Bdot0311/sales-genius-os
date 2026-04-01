import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Free email domains to reject
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'gmx.com', 'live.com', 'msn.com', 'me.com', 'inbox.com'
]);

function isValidEmail(email: string | null): boolean {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !FREE_EMAIL_DOMAINS.has(domain);
}

function extractDomain(email: string | null, website: string | null): string | null {
  if (website) {
    try {
      const url = new URL(website.startsWith('http') ? website : `https://${website}`);
      return url.hostname.replace('www.', '');
    } catch {}
  }
  if (email) {
    const domain = email.split('@')[1]?.toLowerCase();
    if (domain && !FREE_EMAIL_DOMAINS.has(domain)) {
      return domain;
    }
  }
  return null;
}

function calculateDataQualityScore(contact: any, company: any): number {
  let score = 0;
  if (contact?.email && isValidEmail(contact.email)) score += 25;
  if (contact?.linkedin_url) score += 20;
  if (company?.domain) score += 20;
  if (company?.employee_count || company?.revenue_range) score += 15;
  if (contact?.job_title) score += 10;
  if (company?.industry) score += 10;
  return score;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batch_size = 100 } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting SalesOS Lead Network refresh, batch size:', batch_size);

    // Find LeadIndex records not refreshed in 30+ days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: staleRecords, error: fetchError } = await supabase
      .from('lead_index')
      .select(`
        *,
        contact:contacts(*),
        company:companies(*)
      `)
      .eq('is_active', true)
      .lt('last_refreshed_at', thirtyDaysAgo)
      .limit(batch_size);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${staleRecords?.length || 0} stale records to refresh`);

    let refreshed = 0;
    let deactivated = 0;

    for (const record of staleRecords || []) {
      try {
        const contact = record.contact;
        const company = record.company;

        // Validation checks
        const isValid = 
          contact?.email && isValidEmail(contact.email) &&
          (company?.domain || extractDomain(contact.email, null)) &&
          contact?.job_title;

        if (!isValid) {
          // Deactivate invalid records
          await supabase
            .from('lead_index')
            .update({ 
              is_active: false,
              last_refreshed_at: new Date().toISOString()
            })
            .eq('id', record.id);
          
          deactivated++;
          continue;
        }

        // Recalculate data quality score
        const newScore = calculateDataQualityScore(contact, company);

        // Try to re-enrich the lead if there's a corresponding lead record
        const { data: leadRecord } = await supabase
          .from('leads')
          .select('id')
          .eq('contact_email', contact.email)
          .maybeSingle();

        if (leadRecord) {
          // Trigger enrichment
          try {
            await supabase.functions.invoke('enrich-lead', {
              body: { leadId: leadRecord.id }
            });
          } catch (enrichError) {
            console.error('Enrichment failed for lead:', leadRecord.id, enrichError);
          }

          // Trigger scoring
          try {
            await supabase.functions.invoke('score-lead', {
              body: {
                company_name: company?.name,
                contact_name: `${contact.first_name} ${contact.last_name}`,
                contact_email: contact.email,
                industry: company?.industry,
                company_size: record.employee_bucket,
                job_title: contact.job_title,
                source: contact.source,
              }
            });
          } catch (scoreError) {
            console.error('Scoring failed for lead:', leadRecord.id, scoreError);
          }
        }

        // Update LeadIndex
        await supabase
          .from('lead_index')
          .update({ 
            data_quality_score: newScore,
            last_refreshed_at: new Date().toISOString(),
            canonical_title: contact.job_title?.toLowerCase(),
            canonical_industry: company?.industry?.toLowerCase(),
            canonical_domain: company?.domain,
          })
          .eq('id', record.id);

        refreshed++;
      } catch (recordError) {
        console.error('Error processing record:', record.id, recordError);
      }
    }

    console.log(`Refresh complete: ${refreshed} refreshed, ${deactivated} deactivated`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Network refresh complete`,
        stats: {
          processed: staleRecords?.length || 0,
          refreshed,
          deactivated,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in refresh-salesos-network function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
