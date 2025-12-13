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
    const { query, limit = 25 } = await req.json();
    
    if (!query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: true, prospects: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    console.log('Searching prospects for user:', user.id, 'query:', query);

    let prospects: any[] = [];

    // Generate sample prospects from SalesOS Lead Intelligence Network
    console.log('Generating sample prospects from SalesOS Lead Intelligence Network');
    
    const sampleCompanies = [
      { name: 'TechVenture Solutions', industry: 'Technology', size: '51-200' },
      { name: 'DataFlow Analytics', industry: 'Technology', size: '11-50' },
      { name: 'CloudFirst Systems', industry: 'Technology', size: '201-500' },
      { name: 'InnovateTech Labs', industry: 'Technology', size: '11-50' },
      { name: 'Digital Dynamics Corp', industry: 'Technology', size: '51-200' },
      { name: 'NextGen Software', industry: 'Technology', size: '1-10' },
      { name: 'Quantum Computing Inc', industry: 'Technology', size: '51-200' },
      { name: 'AI Innovations Ltd', industry: 'Technology', size: '11-50' },
      { name: 'SmartData Solutions', industry: 'Technology', size: '201-500' },
      { name: 'CyberTech Security', industry: 'Technology', size: '51-200' },
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

    // If no specific matches, return some random ones
    const companiesToUse = matchingCompanies.length > 0 ? matchingCompanies : sampleCompanies.slice(0, limit);

    prospects = companiesToUse.slice(0, limit).map((company, index) => ({
      company_name: company.name,
      contact_name: sampleContacts[index % sampleContacts.length],
      contact_email: `contact${index + 1}@${company.name.toLowerCase().replace(/\s+/g, '')}.com`,
      industry: company.industry,
      company_size: company.size,
      source: 'SalesOS',
      job_title: sampleTitles[index % sampleTitles.length],
      lead_status: 'discovered',
    }));

    console.log('Returning', prospects.length, 'prospects');

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
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        prospects: []
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function getCompanySizeLabel(employeeCount?: number): string | null {
  if (!employeeCount) return null;
  if (employeeCount <= 10) return '1-10';
  if (employeeCount <= 50) return '11-50';
  if (employeeCount <= 200) return '51-200';
  if (employeeCount <= 500) return '201-500';
  if (employeeCount <= 1000) return '501-1000';
  return '1000+';
}