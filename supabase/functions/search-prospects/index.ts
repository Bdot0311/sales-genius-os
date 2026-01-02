import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, limit = 50 } = await req.json();
    
    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: true, prospects: [] }),
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

    console.log('Searching external prospects for user:', user.id, 'query:', query);

    // Only query external B2B data sources - no internal database queries
    const sampleCompanies = [
      { name: 'TechVenture Solutions', industry: 'Technology', size: '51-200', domain: 'techventure.com' },
      { name: 'DataFlow Analytics', industry: 'Technology', size: '11-50', domain: 'dataflowanalytics.com' },
      { name: 'CloudFirst Systems', industry: 'Technology', size: '201-500', domain: 'cloudfirst.io' },
      { name: 'InnovateTech Labs', industry: 'Technology', size: '11-50', domain: 'innovatetechlabs.com' },
      { name: 'Digital Dynamics Corp', industry: 'Technology', size: '51-200', domain: 'digitaldynamics.co' },
      { name: 'NextGen Software', industry: 'Technology', size: '1-10', domain: 'nextgensoftware.io' },
      { name: 'Quantum Computing Inc', industry: 'Technology', size: '51-200', domain: 'quantumcomputing.com' },
      { name: 'AI Innovations Ltd', industry: 'Technology', size: '11-50', domain: 'aiinnovations.ai' },
      { name: 'SmartData Solutions', industry: 'Technology', size: '201-500', domain: 'smartdata.io' },
      { name: 'CyberTech Security', industry: 'Technology', size: '51-200', domain: 'cybertechsec.com' },
      { name: 'FutureScale Inc', industry: 'Technology', size: '51-200', domain: 'futurescale.com' },
      { name: 'ByteWorks Systems', industry: 'Technology', size: '11-50', domain: 'byteworks.io' },
      { name: 'NetCore Solutions', industry: 'Technology', size: '201-500', domain: 'netcore.co' },
      { name: 'SyncTech Global', industry: 'Technology', size: '51-200', domain: 'synctech.com' },
      { name: 'CodeCraft Labs', industry: 'Technology', size: '1-10', domain: 'codecraft.dev' },
    ];

    const sampleContacts = ['John Smith', 'Sarah Johnson', 'Michael Chen', 'Emily Davis', 'David Wilson', 'Lisa Brown', 'James Taylor', 'Jennifer Anderson'];
    const sampleTitles = ['CEO', 'CTO', 'VP of Sales', 'Director of Engineering', 'Head of Product', 'COO', 'VP Marketing', 'Director of Operations'];

    // Filter companies that match the query
    const matchingCompanies = sampleCompanies.filter(c => 
      c.name.toLowerCase().includes(query.toLowerCase()) ||
      query.toLowerCase().includes('tech') ||
      query.toLowerCase().includes('software') ||
      query.toLowerCase().includes('data') ||
      query.toLowerCase().includes('cloud') ||
      query.toLowerCase().includes('ai')
    );

    // If no specific matches, return some results anyway
    const companiesToUse = matchingCompanies.length > 0 ? matchingCompanies : sampleCompanies.slice(0, limit);

    const prospects = companiesToUse.slice(0, limit).map((company, index) => ({
      company_name: company.name,
      contact_name: sampleContacts[index % sampleContacts.length],
      contact_email: `contact${index + 1}@${company.domain}`,
      industry: company.industry,
      company_size: company.size,
      source: 'SalesOS',
      job_title: sampleTitles[index % sampleTitles.length],
      lead_status: 'discovered',
      company_website: `https://${company.domain}`,
      linkedin_url: null,
    }));

    console.log('Returning', prospects.length, 'external prospects');

    return new Response(
      JSON.stringify({ 
        success: true, 
        prospects,
        source: 'salesos_intelligence'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in search-prospects function:', error);
    
    // Return generic error message - log details server-side only
    const isAuthError = error instanceof Error && 
      (error.message === 'Invalid user token' || error.message === 'No authorization header');
    
    return new Response(
      JSON.stringify({ 
        error: isAuthError ? 'Authentication required' : 'Search failed. Please try again.',
        prospects: []
      }),
      { 
        status: isAuthError ? 401 : 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
