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
    const { leadId } = await req.json();
    
    if (!leadId) {
      throw new Error('Lead ID is required');
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

    console.log('Enriching lead for user:', user.id);

    // Get Apollo integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('integration_id', 'apollo')
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error('Apollo.io integration not configured. Please add your API key in Settings > Integrations.');
    }

    const apolloApiKey = integration.config.api_key;
    if (!apolloApiKey) {
      throw new Error('Apollo API key not found in integration config');
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

    // Prepare enrichment data object
    const enrichmentData: any = {
      enrichment_status: 'enriched',
      enriched_at: new Date().toISOString()
    };

    // Enrich person data using Apollo People API
    if (lead.contact_email || lead.contact_name) {
      try {
        const personPayload: any = {};
        if (lead.contact_email) personPayload.email = lead.contact_email;
        if (lead.contact_name) {
          const nameParts = lead.contact_name.split(' ');
          personPayload.first_name = nameParts[0];
          if (nameParts.length > 1) {
            personPayload.last_name = nameParts.slice(1).join(' ');
          }
        }

        console.log('Calling Apollo People API with:', personPayload);

        const personResponse = await fetch('https://api.apollo.io/v1/people/match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apolloApiKey
          },
          body: JSON.stringify(personPayload)
        });

        if (personResponse.ok) {
          const personData = await personResponse.json();
          console.log('Apollo person response:', personData);
          
          if (personData.person) {
            const person = personData.person;
            if (person.linkedin_url) enrichmentData.linkedin_url = person.linkedin_url;
            if (person.title) enrichmentData.job_title = person.title;
            if (person.departments && person.departments.length > 0) {
              enrichmentData.department = person.departments[0];
            }
            if (person.seniority) enrichmentData.seniority = person.seniority;
          }
        } else {
          const errorText = await personResponse.text();
          console.log('Apollo People API error:', personResponse.status, errorText);
        }
      } catch (personError) {
        console.error('Error enriching person data:', personError);
      }
    }

    // Enrich company data using Apollo Organizations API
    if (lead.company_name) {
      try {
        console.log('Calling Apollo Organizations API for:', lead.company_name);

        const orgResponse = await fetch('https://api.apollo.io/v1/organizations/enrich', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'X-Api-Key': apolloApiKey
          },
          body: JSON.stringify({
            domain: lead.company_website || undefined,
            name: lead.company_name
          })
        });

        if (orgResponse.ok) {
          const orgData = await orgResponse.json();
          console.log('Apollo org response:', orgData);
          
          if (orgData.organization) {
            const org = orgData.organization;
            if (org.website_url) enrichmentData.company_website = org.website_url;
            if (org.linkedin_url) enrichmentData.company_linkedin = org.linkedin_url;
            if (org.short_description) enrichmentData.company_description = org.short_description;
            if (org.estimated_num_employees) {
              enrichmentData.employee_count = org.estimated_num_employees.toString();
            }
            if (org.annual_revenue) {
              enrichmentData.annual_revenue = `$${(org.annual_revenue / 1000000).toFixed(1)}M`;
            }
            if (org.industry) enrichmentData.industry = org.industry;
            if (org.technologies && Array.isArray(org.technologies)) {
              enrichmentData.technologies = org.technologies.map((t: any) => t.name || t);
            }
          }
        } else {
          const errorText = await orgResponse.text();
          console.log('Apollo Organizations API error:', orgResponse.status, errorText);
        }
      } catch (orgError) {
        console.error('Error enriching company data:', orgError);
      }
    }

    // Update lead with enriched data
    const { error: updateError } = await supabase
      .from('leads')
      .update(enrichmentData)
      .eq('id', leadId)
      .eq('user_id', user.id);

    if (updateError) {
      throw updateError;
    }

    console.log('Lead enriched successfully:', leadId);

    // Log enrichment history
    const enrichedFields = Object.keys(enrichmentData).filter(k => k !== 'enrichment_status' && k !== 'enriched_at');
    await supabase
      .from('enrichment_history')
      .insert({
        lead_id: leadId,
        user_id: user.id,
        fields_enriched: enrichedFields,
        source: 'apollo',
        status: 'success'
      });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Lead enriched successfully',
        enrichedFields
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enrich-lead function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
