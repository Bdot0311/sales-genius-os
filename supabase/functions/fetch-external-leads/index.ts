import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Personal/free email domains to exclude
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'mail.com', 'protonmail.com', 'zoho.com', 'yandex.com',
  'gmx.com', 'live.com', 'msn.com', 'me.com', 'inbox.com', 'fastmail.com',
  'tutanota.com', 'hey.com', 'pm.me', 'proton.me', 'mailbox.org',
  'yahoo.co.uk', 'hotmail.co.uk', 'outlook.co.uk', 'googlemail.com'
]);

interface ExternalLeadFilters {
  job_title?: string;
  industry?: string;
  company_size_min?: number;
  company_size_max?: number;
  country?: string;
  limit?: number;
}

interface BusinessContact {
  job_title: string;
  company_name: string;
  company_domain: string;
  business_email: string;
  contact_name: string;
  industry?: string;
  company_size?: string;
  country?: string;
}

function isBusinessEmail(email: string): boolean {
  if (!email) return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !PERSONAL_EMAIL_DOMAINS.has(domain);
}

function getCompanySizeLabel(min?: number, max?: number): string | null {
  if (!min && !max) return null;
  if (min && min >= 1000) return '1000+';
  if (max && max <= 10) return '1-10';
  if (max && max <= 50) return '11-50';
  if (max && max <= 200) return '51-200';
  if (max && max <= 500) return '201-500';
  if (max && max <= 1000) return '501-1000';
  return '51-200'; // Default
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const filters: ExternalLeadFilters = await req.json();
    const { job_title, industry, company_size_min, company_size_max, country, limit = 50 } = filters;

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

    console.log('Fetching external leads with filters:', filters);

    // Simulate external B2B data provider query
    // In production, replace this with actual API calls to providers like Apollo, ZoomInfo, etc.
    const sampleData = generateSampleBusinessContacts(filters, limit);

    // Filter to only include business emails
    const businessContacts = sampleData.filter(contact => isBusinessEmail(contact.business_email));

    console.log(`Found ${businessContacts.length} business contacts (filtered from ${sampleData.length})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        contacts: businessContacts,
        total: businessContacts.length,
        filters_applied: {
          job_title: job_title || null,
          industry: industry || null,
          company_size_range: company_size_min || company_size_max ? 
            `${company_size_min || 1}-${company_size_max || '∞'}` : null,
          country: country || null,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-external-leads function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        contacts: []
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function generateSampleBusinessContacts(filters: ExternalLeadFilters, limit: number): BusinessContact[] {
  const { job_title, industry, company_size_min, company_size_max, country } = filters;

  // Sample data pools
  const companies = [
    { name: 'TechVenture Solutions', domain: 'techventure.com', industry: 'Technology', size: '51-200', country: 'United States' },
    { name: 'DataFlow Analytics', domain: 'dataflowanalytics.com', industry: 'Technology', size: '11-50', country: 'United States' },
    { name: 'CloudFirst Systems', domain: 'cloudfirst.io', industry: 'Technology', size: '201-500', country: 'United States' },
    { name: 'InnovateTech Labs', domain: 'innovatetechlabs.com', industry: 'Technology', size: '11-50', country: 'Canada' },
    { name: 'Digital Dynamics Corp', domain: 'digitaldynamics.co', industry: 'Technology', size: '51-200', country: 'United Kingdom' },
    { name: 'NextGen Software', domain: 'nextgensoftware.io', industry: 'Technology', size: '1-10', country: 'Germany' },
    { name: 'Quantum Computing Inc', domain: 'quantumcomputing.com', industry: 'Technology', size: '51-200', country: 'United States' },
    { name: 'AI Innovations Ltd', domain: 'aiinnovations.ai', industry: 'Technology', size: '11-50', country: 'United Kingdom' },
    { name: 'SmartData Solutions', domain: 'smartdata.io', industry: 'Technology', size: '201-500', country: 'Australia' },
    { name: 'CyberTech Security', domain: 'cybertechsec.com', industry: 'Technology', size: '51-200', country: 'United States' },
    { name: 'HealthFirst Medical', domain: 'healthfirst.com', industry: 'Healthcare', size: '501-1000', country: 'United States' },
    { name: 'MediCare Solutions', domain: 'medicare-solutions.com', industry: 'Healthcare', size: '201-500', country: 'Canada' },
    { name: 'BioTech Research', domain: 'biotechresearch.io', industry: 'Healthcare', size: '51-200', country: 'United States' },
    { name: 'FinanceHub Global', domain: 'financehub.com', industry: 'Finance', size: '1000+', country: 'United States' },
    { name: 'Capital Investments', domain: 'capitalinvest.co', industry: 'Finance', size: '201-500', country: 'United Kingdom' },
    { name: 'RetailMax Corp', domain: 'retailmax.com', industry: 'Retail', size: '501-1000', country: 'United States' },
    { name: 'ShopSmart Online', domain: 'shopsmart.io', industry: 'Retail', size: '51-200', country: 'Australia' },
    { name: 'ManufacturePro', domain: 'manufacturepro.com', industry: 'Manufacturing', size: '1000+', country: 'Germany' },
    { name: 'Industrial Systems', domain: 'industrialsys.com', industry: 'Manufacturing', size: '201-500', country: 'United States' },
  ];

  const titles = [
    'CEO', 'CTO', 'CFO', 'COO', 'VP of Sales', 'VP of Marketing', 'VP of Engineering',
    'Director of Sales', 'Director of Marketing', 'Director of Engineering', 'Director of Operations',
    'Head of Product', 'Head of Growth', 'Head of Business Development',
    'Sales Manager', 'Marketing Manager', 'Engineering Manager', 'Product Manager',
    'Senior Account Executive', 'Account Executive', 'Business Development Representative'
  ];

  const firstNames = ['John', 'Sarah', 'Michael', 'Emily', 'David', 'Lisa', 'James', 'Jennifer', 'Robert', 'Amanda', 'Chris', 'Jessica', 'Daniel', 'Ashley', 'Matthew'];
  const lastNames = ['Smith', 'Johnson', 'Chen', 'Davis', 'Wilson', 'Brown', 'Taylor', 'Anderson', 'Lee', 'Garcia', 'Martinez', 'Rodriguez', 'Kim', 'Patel', 'Williams'];

  // Filter companies based on criteria
  let filteredCompanies = companies;

  if (industry) {
    filteredCompanies = filteredCompanies.filter(c => 
      c.industry.toLowerCase().includes(industry.toLowerCase())
    );
  }

  if (country) {
    filteredCompanies = filteredCompanies.filter(c => 
      c.country.toLowerCase().includes(country.toLowerCase())
    );
  }

  if (company_size_min || company_size_max) {
    const sizeOrder: Record<string, number> = {
      '1-10': 5, '11-50': 30, '51-200': 125, '201-500': 350, '501-1000': 750, '1000+': 1500
    };
    
    filteredCompanies = filteredCompanies.filter(c => {
      const avgSize = sizeOrder[c.size] || 100;
      const min = company_size_min || 0;
      const max = company_size_max || Infinity;
      return avgSize >= min && avgSize <= max;
    });
  }

  // Filter titles based on job_title filter
  let filteredTitles = titles;
  if (job_title) {
    const searchTerms = job_title.toLowerCase().split(/[\s,]+/);
    filteredTitles = titles.filter(t => 
      searchTerms.some(term => t.toLowerCase().includes(term))
    );
    // If no matches, use all titles
    if (filteredTitles.length === 0) filteredTitles = titles;
  }

  // Generate contacts
  const contacts: BusinessContact[] = [];
  const usedCombinations = new Set<string>();

  for (let i = 0; i < Math.min(limit, filteredCompanies.length * filteredTitles.length); i++) {
    const company = filteredCompanies[i % filteredCompanies.length];
    const title = filteredTitles[i % filteredTitles.length];
    const firstName = firstNames[i % firstNames.length];
    const lastName = lastNames[(i + 3) % lastNames.length];
    
    const combinationKey = `${company.domain}-${firstName}-${lastName}`;
    if (usedCombinations.has(combinationKey)) continue;
    usedCombinations.add(combinationKey);

    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${company.domain}`;

    contacts.push({
      job_title: title,
      company_name: company.name,
      company_domain: company.domain,
      business_email: email,
      contact_name: `${firstName} ${lastName}`,
      industry: company.industry,
      company_size: company.size,
      country: company.country,
    });

    if (contacts.length >= limit) break;
  }

  return contacts;
}
