import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCaller } from '../_shared/internal-auth.ts';

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
    // Cron signs with the vault secret named email_queue_service_role_key,
    // which despite its name holds INTERNAL_TRIGGER_SECRET (see
    // sync-vault-service-key). isInternalCaller accepts that as well as the
    // service role key, which is why every job using it works; comparing
    // against SUPABASE_SERVICE_ROLE_KEY alone rejects cron outright.
    const isServiceRole = isInternalCaller(req);
    
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
        
        // Generate sample leads from OutReign Lead Intelligence Network
        const sampleCompanies = [
          { name: 'TechVenture Solutions', industry: 'Technology', size: '51-200' },
          { name: 'DataFlow Analytics', industry: 'Technology', size: '11-50' },
          { name: 'CloudFirst Systems', industry: 'Technology', size: '201-500' },
        ];

        const sampleContacts = ['John Smith', 'Sarah Johnson', 'Michael Chen'];
        const sampleTitles = ['CEO', 'CTO', 'VP of Sales'];

        importedLeads = sampleCompanies.map((company, index) => ({
          organization: { name: company.name, industry: company.industry },
          first_name: sampleContacts[index].split(' ')[0],
          last_name: sampleContacts[index].split(' ')[1],
          title: sampleTitles[index],
          email: `contact@${company.name.toLowerCase().replace(/\s+/g, '')}.com`,
        }));

        if (importedLeads.length === 0) {
          console.log(`No leads found for schedule ${schedule.id}`);
          continue;
        }

        // Apply field mappings
        const fieldMappings = schedule.field_mappings || {};
        const formattedLeads = importedLeads.map((lead: any) => {
          const mappedLead: any = {
            user_id: schedule.user_id,
            source: 'OutReign'
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

        /*
         * Drop the ones this account already has, before inserting.
         *
         * `next_run_at` is advanced after the insert, so a run killed in
         * between — this function has no wall clock and the platform stops it
         * around 150s — leaves the leads in and the schedule un-advanced, and
         * the next hourly pass imports the same search again. There is no
         * unique constraint on leads to catch that, so it produced duplicate
         * rows for the same person. Two rows for one prospect is not untidy
         * data, it is two sequences and two emails to someone who was
         * contacted once.
         *
         * The fix is idempotence rather than reordering. Advancing the
         * schedule first would turn a killed run into a silently skipped
         * import, which trades duplicate leads for missing ones. Making the
         * insert a no-op on a repeat keeps the at-least-once behaviour and
         * removes the harm.
         *
         * The rule is the repo's own, from `dropSeenLeads` in
         * fetch-external-leads: the same contact_email, or failing that the
         * same contact_name and company_name.
         */
        const { data: seenRows } = await supabase
          .from('leads')
          .select('contact_email, contact_name, company_name')
          .eq('user_id', schedule.user_id)
          .limit(5000);
        const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
        const seenEmails = new Set(
          (seenRows ?? []).map((r: any) => norm(r.contact_email)).filter(Boolean)
        );
        const seenPairs = new Set(
          (seenRows ?? []).map((r: any) => `${norm(r.contact_name)}|${norm(r.company_name)}`)
        );
        const freshLeads = formattedLeads.filter((l: any) => {
          const email = norm(l.contact_email);
          if (email && seenEmails.has(email)) return false;
          return !seenPairs.has(`${norm(l.contact_name)}|${norm(l.company_name)}`);
        });
        const alreadyHeld = formattedLeads.length - freshLeads.length;

        // Insert leads
        const { data: insertedLeads, error: insertError } = freshLeads.length
          ? await supabase.from('leads').insert(freshLeads).select()
          : { data: [], error: null };

        /*
         * The error used to be destructured and never read.
         *
         * A failed insert still advanced the schedule and still wrote a
         * history row, so a search whose mapping no longer matches imported
         * nothing, every hour, with the reason recorded nowhere. The count was
         * honest and the cause was invisible, which is the combination that
         * keeps something broken for weeks.
         */
        if (insertError) {
          console.error(
            `[run-scheduled-imports] schedule ${schedule.id} insert failed:`,
            insertError.message,
          );
        }

        const successCount = insertedLeads?.length || 0;
        const failedCount = freshLeads.length - successCount;

        // Log import history
        await supabase.from('import_history').insert({
          user_id: schedule.user_id,
          source: 'OutReign',
          // What the search returned, not what survived the dedupe: a run that
          // found fifty and held fifty already did not find nothing.
          leads_count: formattedLeads.length,
          success_count: successCount,
          failed_count: failedCount,
          import_type: 'scheduled',
          search_query: insertError
            ? `${schedule.search_query ?? ''} [import failed: ${insertError.message}]`.slice(0, 500)
            : schedule.search_query,
          field_mappings: schedule.field_mappings
        });
        if (alreadyHeld > 0) {
          console.log(
            `[run-scheduled-imports] schedule ${schedule.id}: ${alreadyHeld} already held, ${freshLeads.length} new`,
          );
        }

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