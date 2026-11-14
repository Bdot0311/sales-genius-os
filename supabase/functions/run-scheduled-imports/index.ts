import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  chunk,
  companiesToCheck,
  dropAlreadyHeld,
  emailsToCheck,
  indexHeld,
  orIlike,
} from "../_shared/lead-dedupe.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
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
         * import, which trades duplicate leads for missing ones.
         *
         * ── Sized by the import, not by the account ─────────────────────
         *
         * The first version read the account's leads with a 5,000 row cap,
         * which is a correctness hole rather than a soft limit: an account
         * past that has an incomplete picture of what it holds, and the
         * leads outside the window come back as new. So the lookup asks only
         * about the people actually arriving. A fifty-lead import asks about
         * fifty addresses however many leads the account has.
         */
        const wantEmails = emailsToCheck(formattedLeads);
        const wantCompanies = companiesToCheck(formattedLeads);

        const heldRows: any[] = [];
        let lookupFailed: string | null = null;

        /*
         * Compared the way the filter compares.
         *
         * `in` is case-sensitive in Postgres, and these values are normalised
         * before they are matched — so asking for "jo@x.com" misses a stored
         * "Jo@X.com" and the lead is inserted again. The account-wide scan
         * this replaced did not have that problem, because it normalised in
         * memory; sizing the query by the import reintroduced it. Chunked,
         * because the filter goes in the URL.
         */
        const lookupBy = async (column: string, values: string[]) => {
          for (const run of chunk(values)) {
            if (lookupFailed) return;
            const { data, error } = await supabase
              .from('leads')
              .select('contact_email, contact_name, company_name')
              .eq('user_id', schedule.user_id)
              .or(orIlike(column, run));
            if (error) { lookupFailed = error.message; return; }
            heldRows.push(...(data ?? []));
          }
        };

        await lookupBy('contact_email', wantEmails);
        /*
         * The companies are for the fallback key, which only applies to leads
         * arriving without an address. A partial answer here lets a nameless
         * duplicate through; a partial answer on the addresses above would let
         * a real one through, which is why that one is not capped.
         */
        if (!lookupFailed) await lookupBy('company_name', wantCompanies.slice(0, 200));

        /*
         * A failed lookup is not an empty account.
         *
         * Ignoring this error was the same mistake as ignoring the insert's,
         * committed in the same change: a transient read failure made every
         * arriving prospect look new, and the insert that followed wrote the
         * duplicates this whole guard exists to prevent. So the schedule is
         * skipped without advancing, and the next hourly pass retries it —
         * the one direction that cannot do harm.
         */
        if (lookupFailed) {
          console.error(
            `[run-scheduled-imports] schedule ${schedule.id} skipped: could not read existing leads:`,
            lookupFailed,
          );
          continue;
        }

        const freshLeads = dropAlreadyHeld(formattedLeads as any[], indexHeld(heldRows));
        const alreadyHeldCount = formattedLeads.length - freshLeads.length;

        // Insert leads
        const { data: insertedLeads, error: insertError } = freshLeads.length
          ? await supabase.from('leads').insert(freshLeads).select()
          : { data: [] as any[], error: null };

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
          // The reason first: a long saved query would otherwise push the
          // whole message out of the field and leave the honest count with an
          // invisible cause again.
          search_query: insertError
            ? `[import failed: ${insertError.message}] ${schedule.search_query ?? ''}`.slice(0, 500)
            : schedule.search_query,
          field_mappings: schedule.field_mappings
        });
        if (alreadyHeldCount > 0) {
          console.log(
            `[run-scheduled-imports] schedule ${schedule.id}: ${alreadyHeldCount} already held, ${freshLeads.length} new`,
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