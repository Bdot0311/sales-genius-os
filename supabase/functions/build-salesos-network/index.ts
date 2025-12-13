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

function generateQueryHash(params: any): string {
  const normalized = JSON.stringify(params);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

function getEmployeeBucket(size: string | null): string | null {
  if (!size) return null;
  const sizeMap: Record<string, string> = {
    '1-10': '1-10',
    '11-50': '11-50',
    '51-200': '51-200',
    '201-500': '201-1000',
    '501-1000': '201-1000',
    '201-1000': '201-1000',
    '1000+': '1000+',
  };
  return sizeMap[size] || null;
}

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

function calculateDataQualityScore(prospect: any): number {
  let score = 0;
  if (prospect.contact_email && isValidEmail(prospect.contact_email)) score += 25;
  if (prospect.linkedin_url) score += 20;
  if (extractDomain(prospect.contact_email, prospect.company_website)) score += 20;
  if (prospect.company_size) score += 15;
  if (prospect.job_title) score += 10;
  if (prospect.industry) score += 10;
  return score;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      industries = [], 
      countries = [], 
      title_keywords = [], 
      employee_buckets = [],
      max_records_per_run = 100
    } = await req.json();

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

    // Check if user is admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      throw new Error('Admin access required');
    }

    console.log('Building SalesOS Lead Network with params:', { industries, countries, title_keywords, employee_buckets, max_records_per_run });

    let totalProcessed = 0;
    let totalAdded = 0;
    let totalSkipped = 0;

    // Sample data generator for demonstration
    const sampleCompanyNames = [
      'TechVenture', 'DataFlow', 'CloudFirst', 'InnovateTech', 'Digital Dynamics',
      'NextGen', 'Quantum', 'AI Innovations', 'SmartData', 'CyberTech',
      'FutureScale', 'CodeCraft', 'ByteWorks', 'NetCore', 'SyncTech'
    ];
    const sampleFirstNames = ['John', 'Sarah', 'Michael', 'Emily', 'David', 'Lisa', 'James', 'Jennifer', 'Robert', 'Amanda'];
    const sampleLastNames = ['Smith', 'Johnson', 'Chen', 'Davis', 'Wilson', 'Brown', 'Taylor', 'Anderson', 'Lee', 'Garcia'];
    const sampleTitles = ['CEO', 'CTO', 'VP of Sales', 'Director of Engineering', 'Head of Product', 'COO', 'CFO', 'VP Marketing'];

    // Generate combinations
    const industriesToUse = industries.length > 0 ? industries : ['Technology'];
    const countriesToUse = countries.length > 0 ? countries : ['United States'];
    const bucketsToUse = employee_buckets.length > 0 ? employee_buckets : ['11-50', '51-200'];

    for (const industry of industriesToUse) {
      if (totalProcessed >= max_records_per_run) break;

      for (const country of countriesToUse) {
        if (totalProcessed >= max_records_per_run) break;

        for (const bucket of bucketsToUse) {
          if (totalProcessed >= max_records_per_run) break;

          const queryHash = generateQueryHash({ industry, country, bucket });

          // Check if we've already processed this combination recently
          const { data: recentEvent } = await supabase
            .from('data_provider_events')
            .select('*')
            .eq('query_hash', queryHash)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .maybeSingle();

          if (recentEvent) {
            console.log('Skipping recently processed query:', queryHash);
            continue;
          }

          // Generate sample prospects
          const numProspects = Math.min(10, max_records_per_run - totalProcessed);
          
          for (let i = 0; i < numProspects; i++) {
            if (totalProcessed >= max_records_per_run) break;
            totalProcessed++;

            const companyBaseName = sampleCompanyNames[Math.floor(Math.random() * sampleCompanyNames.length)];
            const companyName = `${companyBaseName} ${industry.slice(0, 4)}`;
            const domain = `${companyName.toLowerCase().replace(/\s+/g, '')}.com`;
            const firstName = sampleFirstNames[Math.floor(Math.random() * sampleFirstNames.length)];
            const lastName = sampleLastNames[Math.floor(Math.random() * sampleLastNames.length)];
            const title = sampleTitles[Math.floor(Math.random() * sampleTitles.length)];
            const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;

            // Check for existing contact
            const { data: existingContact } = await supabase
              .from('contacts')
              .select('id')
              .eq('email', email)
              .maybeSingle();

            if (existingContact) {
              totalSkipped++;
              continue;
            }

            // Check for existing company by domain
            let companyId: string | null = null;
            const { data: existingCompany } = await supabase
              .from('companies')
              .select('id')
              .eq('domain', domain)
              .maybeSingle();

            if (existingCompany) {
              companyId = existingCompany.id;
            } else {
              // Create company
              const { data: newCompany } = await supabase
                .from('companies')
                .insert({
                  user_id: user.id,
                  name: companyName,
                  domain: domain,
                  industry: industry,
                  country: country,
                })
                .select()
                .single();

              companyId = newCompany?.id;
            }

            // Create contact
            const { data: newContact, error: contactError } = await supabase
              .from('contacts')
              .insert({
                user_id: user.id,
                company_id: companyId,
                first_name: firstName,
                last_name: lastName,
                email: email,
                job_title: title,
                country: country,
                source: 'SalesOS',
                lead_status: 'discovered',
              })
              .select()
              .single();

            if (contactError) {
              console.error('Contact insert error:', contactError);
              totalSkipped++;
              continue;
            }

            const dataQualityScore = calculateDataQualityScore({
              contact_email: email,
              linkedin_url: null,
              company_website: `https://${domain}`,
              company_size: bucket,
              job_title: title,
              industry: industry,
            });

            // Create LeadIndex entry
            const { error: leadIndexError } = await supabase
              .from('lead_index')
              .insert({
                user_id: user.id,
                contact_id: newContact.id,
                company_id: companyId,
                canonical_domain: domain,
                canonical_title: title.toLowerCase(),
                canonical_industry: industry.toLowerCase(),
                country: country,
                employee_bucket: getEmployeeBucket(bucket),
                data_quality_score: dataQualityScore,
                last_verified_at: new Date().toISOString(),
                last_refreshed_at: new Date().toISOString(),
                is_active: true,
              });

            if (leadIndexError) {
              console.error('LeadIndex insert error:', leadIndexError);
            } else {
              totalAdded++;
            }
          }

          // Record the provider event
          await supabase.from('data_provider_events').insert({
            provider_name: 'salesos_network',
            query_hash: queryHash,
            user_id: user.id,
            results_count: numProspects,
            cost_units: numProspects * 0.1,
          });
        }
      }
    }

    console.log(`Build complete: ${totalProcessed} processed, ${totalAdded} added, ${totalSkipped} skipped`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: `Network build complete`,
        stats: {
          processed: totalProcessed,
          added: totalAdded,
          skipped: totalSkipped,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in build-salesos-network function:', error);
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
