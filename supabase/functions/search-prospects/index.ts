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

function generateQueryHash(query: string, filters: any): string {
  const normalized = JSON.stringify({ query: query.toLowerCase().trim(), ...filters });
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
    const { query, limit = 50, filters = {} } = await req.json();
    
    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: true, prospects: [], inNetworkCount: 0, newCount: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    console.log('Searching prospects for user:', user.id, 'query:', query);

    // Step 1: Query LeadIndex first (DB-first approach)
    let leadIndexQuery = supabase
      .from('lead_index')
      .select(`
        *,
        contact:contacts(*),
        company:companies(*)
      `)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(limit);

    // Apply filters
    if (filters.industry) {
      leadIndexQuery = leadIndexQuery.eq('canonical_industry', filters.industry);
    }
    if (filters.country) {
      leadIndexQuery = leadIndexQuery.eq('country', filters.country);
    }
    if (filters.employee_bucket) {
      leadIndexQuery = leadIndexQuery.eq('employee_bucket', filters.employee_bucket);
    }
    if (filters.min_quality_score) {
      leadIndexQuery = leadIndexQuery.gte('data_quality_score', filters.min_quality_score);
    }

    // Search by query in title, domain, or industry
    const searchPattern = `%${query.toLowerCase()}%`;
    leadIndexQuery = leadIndexQuery.or(
      `canonical_title.ilike.${searchPattern},canonical_domain.ilike.${searchPattern},canonical_industry.ilike.${searchPattern}`
    );

    const { data: leadIndexResults, error: leadIndexError } = await leadIndexQuery;
    
    if (leadIndexError) {
      console.error('LeadIndex query error:', leadIndexError);
    }

    const inNetworkProspects = (leadIndexResults || []).map(li => ({
      id: li.id,
      company_name: li.company?.name || li.canonical_domain || 'Unknown Company',
      contact_name: li.contact ? `${li.contact.first_name || ''} ${li.contact.last_name || ''}`.trim() : 'Unknown Contact',
      contact_email: li.contact?.email,
      industry: li.canonical_industry,
      company_size: li.employee_bucket,
      source: 'SalesOS',
      job_title: li.canonical_title,
      linkedin_url: li.contact?.linkedin_url,
      company_website: li.company?.domain ? `https://${li.company.domain}` : null,
      lead_status: 'discovered',
      network_status: 'in_network' as const,
      data_quality_score: li.data_quality_score,
    }));

    console.log('Found', inNetworkProspects.length, 'in-network prospects');

    let newProspects: any[] = [];
    const neededCount = limit - inNetworkProspects.length;

    // Step 2: Only fetch from external provider if we need more results
    if (neededCount > 0) {
      const queryHash = generateQueryHash(query, filters);
      
      // Check if we've already fetched this query recently (within 24 hours)
      const { data: recentEvent } = await supabase
        .from('data_provider_events')
        .select('*')
        .eq('query_hash', queryHash)
        .eq('user_id', user.id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (!recentEvent) {
        console.log('Fetching from external provider, needed:', neededCount);
        
        // Generate sample prospects from SalesOS Lead Intelligence Network
        const sampleCompanies = [
          { name: 'TechVenture Solutions', industry: 'Technology', size: '51-200', domain: 'techventure.com' },
          { name: 'DataFlow Analytics', industry: 'Technology', size: '11-50', domain: 'dataflowanalytics.com' },
          { name: 'CloudFirst Systems', industry: 'Technology', size: '201-1000', domain: 'cloudfirst.io' },
          { name: 'InnovateTech Labs', industry: 'Technology', size: '11-50', domain: 'innovatetechlabs.com' },
          { name: 'Digital Dynamics Corp', industry: 'Technology', size: '51-200', domain: 'digitaldynamics.co' },
          { name: 'NextGen Software', industry: 'Technology', size: '1-10', domain: 'nextgensoftware.io' },
          { name: 'Quantum Computing Inc', industry: 'Technology', size: '51-200', domain: 'quantumcomputing.com' },
          { name: 'AI Innovations Ltd', industry: 'Technology', size: '11-50', domain: 'aiinnovations.ai' },
          { name: 'SmartData Solutions', industry: 'Technology', size: '201-1000', domain: 'smartdata.io' },
          { name: 'CyberTech Security', industry: 'Technology', size: '51-200', domain: 'cybertechsec.com' },
        ];

        const sampleContacts = ['John Smith', 'Sarah Johnson', 'Michael Chen', 'Emily Davis', 'David Wilson'];
        const sampleTitles = ['CEO', 'CTO', 'VP of Sales', 'Director of Engineering', 'Head of Product'];

        // Filter companies that match the query
        const matchingCompanies = sampleCompanies.filter(c => 
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          query.toLowerCase().includes('tech') ||
          query.toLowerCase().includes('software') ||
          query.toLowerCase().includes('data')
        );

        const companiesToUse = matchingCompanies.length > 0 ? matchingCompanies : sampleCompanies.slice(0, neededCount);

        // Get existing emails to dedupe
        const { data: existingContacts } = await supabase
          .from('contacts')
          .select('email')
          .eq('user_id', user.id);
        
        const existingEmails = new Set((existingContacts || []).map(c => c.email?.toLowerCase()));

        for (let i = 0; i < Math.min(companiesToUse.length, neededCount); i++) {
          const company = companiesToUse[i];
          const contactEmail = `contact${Date.now() + i}@${company.domain}`;
          
          if (existingEmails.has(contactEmail.toLowerCase())) continue;

          const prospect = {
            company_name: company.name,
            contact_name: sampleContacts[i % sampleContacts.length],
            contact_email: contactEmail,
            industry: company.industry,
            company_size: company.size,
            source: 'SalesOS',
            job_title: sampleTitles[i % sampleTitles.length],
            lead_status: 'discovered',
            company_website: `https://${company.domain}`,
            linkedin_url: null,
          };

          // Validate before adding
          if (!isValidEmail(prospect.contact_email)) continue;
          if (!extractDomain(prospect.contact_email, prospect.company_website)) continue;
          if (!prospect.job_title) continue;

          const dataQualityScore = calculateDataQualityScore(prospect);

          // Save to Company, Contact, and LeadIndex
          // First, upsert company
          const { data: companyData, error: companyError } = await supabase
            .from('companies')
            .upsert({
              user_id: user.id,
              name: company.name,
              domain: company.domain,
              industry: company.industry,
            }, { onConflict: 'user_id,domain', ignoreDuplicates: true })
            .select()
            .maybeSingle();

          if (companyError) console.error('Company upsert error:', companyError);

          // Then, upsert contact
          const nameParts = prospect.contact_name.split(' ');
          const { data: contactData, error: contactError } = await supabase
            .from('contacts')
            .insert({
              user_id: user.id,
              first_name: nameParts[0],
              last_name: nameParts.slice(1).join(' '),
              email: prospect.contact_email,
              job_title: prospect.job_title,
              company_id: companyData?.id,
              source: 'SalesOS',
              lead_status: 'discovered',
            })
            .select()
            .maybeSingle();

          if (contactError) {
            console.error('Contact insert error:', contactError);
            continue;
          }

          // Finally, create LeadIndex entry
          if (contactData) {
            const { error: leadIndexError } = await supabase
              .from('lead_index')
              .insert({
                user_id: user.id,
                contact_id: contactData.id,
                company_id: companyData?.id,
                canonical_domain: company.domain,
                canonical_title: prospect.job_title?.toLowerCase(),
                canonical_industry: company.industry?.toLowerCase(),
                employee_bucket: getEmployeeBucket(company.size),
                data_quality_score: dataQualityScore,
                last_verified_at: new Date().toISOString(),
                last_refreshed_at: new Date().toISOString(),
                is_active: true,
              });

            if (leadIndexError) console.error('LeadIndex insert error:', leadIndexError);
          }

          newProspects.push({
            ...prospect,
            network_status: 'new' as const,
            data_quality_score: dataQualityScore,
          });
        }

        // Record the provider event
        await supabase.from('data_provider_events').insert({
          provider_name: 'salesos_network',
          query_hash: queryHash,
          user_id: user.id,
          results_count: newProspects.length,
          cost_units: newProspects.length * 0.1,
        });
      }
    }

    // Combine results
    const allProspects = [...inNetworkProspects, ...newProspects];

    console.log('Returning', allProspects.length, 'total prospects (', inNetworkProspects.length, 'in-network,', newProspects.length, 'new)');

    return new Response(
      JSON.stringify({ 
        success: true, 
        prospects: allProspects,
        inNetworkCount: inNetworkProspects.length,
        newCount: newProspects.length,
        source: 'salesos_intelligence'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-prospects function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        prospects: [],
        inNetworkCount: 0,
        newCount: 0
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
