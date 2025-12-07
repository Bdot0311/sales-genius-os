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
    // Security: Validate that this is called with service role key (internal only)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Verify the request is using service role key (for cron jobs) or valid user token
    const token = authHeader.replace('Bearer ', '');
    const isServiceRole = token === supabaseServiceKey;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!isServiceRole) {
      // If not service role, validate as admin user
      const { data: userData, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !userData.user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authorization' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      // Check if user is admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .eq('role', 'admin')
        .single();

      if (!roleData) {
        return new Response(
          JSON.stringify({ error: 'Admin access required' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }

      console.log('Admin user authorized:', userData.user.id);
    } else {
      console.log('Service role authorized for scheduled job');
    }

    // Get all active scheduled imports that are due
    const { data: scheduledImports, error: scheduleError } = await supabase
      .from('scheduled_imports')
      .select('*')
      .eq('is_active', true)
      .lte('next_run_at', new Date().toISOString());

    if (scheduleError) throw scheduleError;

    console.log(`Found ${scheduledImports?.length || 0} scheduled imports to process`);

    for (const schedule of scheduledImports || []) {
      try {
        // Get the user's integration
        const { data: integration, error: integrationError } = await supabase
          .from('integrations')
          .select('*')
          .eq('user_id', schedule.user_id)
          .eq('integration_id', schedule.integration_id)
          .eq('is_active', true)
          .single();

        if (integrationError || !integration) {
          console.log(`Integration not found for schedule ${schedule.id}`);
          continue;
        }

        let importedLeads: any[] = [];
        
        // Perform the search based on integration type
        if (schedule.integration_id === 'apollo') {
          const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              'X-Api-Key': integration.config.api_key
            },
            body: JSON.stringify({
              q_keywords: schedule.search_query,
              page: 1,
              per_page: 25
            })
          });

          if (response.ok) {
            const data = await response.json();
            importedLeads = data.people || [];
          }
        } else if (schedule.integration_id === 'crunchbase') {
          const response = await fetch(`https://api.crunchbase.com/api/v4/autocompletes?query=${encodeURIComponent(schedule.search_query)}&collection_ids=organizations&limit=25`, {
            headers: {
              'X-cb-user-key': integration.config.api_key
            }
          });

          if (response.ok) {
            const data = await response.json();
            importedLeads = data.entities || [];
          }
        }

        if (importedLeads.length === 0) {
          console.log(`No leads found for schedule ${schedule.id}`);
          continue;
        }

        // Apply field mappings
        const fieldMappings = schedule.field_mappings || {};
        const formattedLeads = importedLeads.map((lead: any) => {
          const mappedLead: any = {
            user_id: schedule.user_id,
            source: schedule.integration_id === 'apollo' ? 'Apollo' : 'Crunchbase'
          };

          // Apply custom field mappings or use defaults
          if (fieldMappings.company_name) {
            mappedLead.company_name = lead[fieldMappings.company_name] || 'Unknown Company';
          } else {
            mappedLead.company_name = lead.organization?.name || lead.company || lead.name || 'Unknown Company';
          }

          if (fieldMappings.contact_name) {
            mappedLead.contact_name = lead[fieldMappings.contact_name] || 'Unknown Contact';
          } else {
            mappedLead.contact_name = lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown Contact';
          }

          // Map other fields
          mappedLead.contact_email = lead[fieldMappings.contact_email || 'email'] || null;
          mappedLead.contact_phone = lead[fieldMappings.contact_phone || 'phone_numbers']?.[0]?.sanitized_number || null;
          mappedLead.industry = lead[fieldMappings.industry] || lead.organization?.industry || null;
          mappedLead.job_title = lead[fieldMappings.job_title || 'title'] || null;
          mappedLead.linkedin_url = lead[fieldMappings.linkedin_url || 'linkedin_url'] || null;
          mappedLead.company_website = lead[fieldMappings.company_website] || lead.organization?.website_url || null;

          return mappedLead;
        });

        // Insert leads
        const { data: insertedLeads, error: insertError } = await supabase
          .from('leads')
          .insert(formattedLeads)
          .select();

        const successCount = insertedLeads?.length || 0;
        const failedCount = formattedLeads.length - successCount;

        // Log import history
        await supabase.from('import_history').insert({
          user_id: schedule.user_id,
          source: schedule.integration_id === 'apollo' ? 'Apollo' : 'Crunchbase',
          leads_count: formattedLeads.length,
          success_count: successCount,
          failed_count: failedCount,
          import_type: 'scheduled',
          search_query: schedule.search_query,
          field_mappings: schedule.field_mappings
        });

        // Update schedule for next run
        const now = new Date();
        let nextRun = new Date(now);
        
        if (schedule.schedule_frequency === 'daily') {
          nextRun.setDate(nextRun.getDate() + 1);
        } else if (schedule.schedule_frequency === 'weekly') {
          nextRun.setDate(nextRun.getDate() + 7);
        }

        await supabase
          .from('scheduled_imports')
          .update({
            last_run_at: now.toISOString(),
            next_run_at: nextRun.toISOString()
          })
          .eq('id', schedule.id);

        console.log(`Successfully processed schedule ${schedule.id}: ${successCount} leads imported`);
      } catch (scheduleError) {
        console.error(`Error processing schedule ${schedule.id}:`, scheduleError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: scheduledImports?.length || 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in run-scheduled-imports function:', error);
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
