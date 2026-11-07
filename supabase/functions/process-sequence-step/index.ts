import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { htmlToPlainText } from "../_shared/plain-text.ts";
import { proofFromLead, queuedCopyBlockers } from "../_shared/template-send-gate.ts";
import { bodyViolations, evaluateStoredSnapshots } from "../_shared/evidence-contract.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Require authentication. Accept either an authenticated end-user JWT or
    // a service-role token (used by internal cron callers).
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const bearer = authHeader.replace('Bearer ', '');
    const isServiceRole = bearer === supabaseKey;
    let authedUserId: string | null = null;
    if (!isServiceRole) {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(bearer);
      if (authErr || !user) {
        return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      authedUserId = user.id;
    }

    const { enrollmentId } = await req.json();

    if (!enrollmentId) {
      return new Response(JSON.stringify({ error: 'enrollmentId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get enrollment details
    let enrollmentQuery = supabase
      .from('sequence_enrollments')
      .select(`
        *,
        sequence:email_sequences(*),
        lead:leads(*)
      `)
      .eq('id', enrollmentId);

    // Non-service-role callers can only touch their own enrollments
    if (authedUserId) {
      enrollmentQuery = enrollmentQuery.eq('user_id', authedUserId);
    }

    const { data: enrollment, error: enrollmentError } = await enrollmentQuery.single();

    if (enrollmentError || !enrollment) {
      return new Response(JSON.stringify({ error: 'Enrollment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // The row can name another account's lead. Insert policies did not
    // require the lead and the sequence to belong to enrollment.user_id, and
    // this function runs as service role, so it would queue that lead's
    // address and stamp last_contacted_at on a row the account does not own.
    // Pause it and stop. A 200 with action "stopped" is a finished outcome:
    // the row is no longer active, so the dispatcher must not treat it as a
    // crash and retry it.
    const leadOwner = enrollment.lead?.user_id;
    const sequenceOwner = enrollment.sequence?.user_id;
    if (!enrollment.lead || !enrollment.sequence || leadOwner !== enrollment.user_id || sequenceOwner !== enrollment.user_id) {
      await supabase
        .from('sequence_enrollments')
        .update({
          status: 'paused',
          paused_reason: 'Stopped because the lead or sequence belongs to a different account.',
        })
        .eq('id', enrollmentId)
        .eq('user_id', enrollment.user_id);
      console.error(`[process-sequence-step] stopped ${enrollmentId}: lead or sequence is not owned by ${enrollment.user_id}`);
      return new Response(JSON.stringify({
        success: false,
        action: 'stopped',
        reason: 'lead_or_sequence_not_owned',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if enrollment is active
    if (enrollment.status !== 'active') {
      return new Response(JSON.stringify({
        success: false,
        reason: `Enrollment is ${enrollment.status}`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if lead has replied (should exit automation)
    if (enrollment.engagement_state === 'replied') {
      await supabase
        .from('sequence_enrollments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', enrollmentId);

      return new Response(JSON.stringify({
        success: true,
        action: 'completed',
        reason: 'Lead replied - sequence completed',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the next step to execute
    const nextStepNumber = enrollment.current_step + 1;
    
    const { data: nextStep, error: stepError } = await supabase
      .from('sequence_steps')
      .select('*')
      .eq('sequence_id', enrollment.sequence_id)
      .eq('step_number', nextStepNumber)
      .eq('is_active', true)
      .single();

    if (stepError || !nextStep) {
      // No more steps - complete the sequence
      await supabase
        .from('sequence_enrollments')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', enrollmentId);

      return new Response(JSON.stringify({
        success: true,
        action: 'completed',
        reason: 'No more steps - sequence completed',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check trigger condition
    const triggerCondition = nextStep.trigger_condition;
    const engagementState = enrollment.engagement_state;
    let shouldExecute = false;

    switch (triggerCondition) {
      case 'on_enroll':
        // 'on_enroll' means "no engagement condition, just the delay". Limiting
        // it to step 1 left every later step with this trigger permanently due
        // and permanently skipped, so follow-ups never sent. The delay is
        // already enforced by next_action_at, so being here means it is time.
        shouldExecute = true;
        break;
      case 'on_no_response':
        shouldExecute = ['contacted', 'new'].includes(engagementState);
        break;
      case 'on_open':
        shouldExecute = ['opened', 'opened_no_click'].includes(engagementState);
        break;
      case 'on_click':
        shouldExecute = engagementState === 'clicked';
        break;
      case 'on_silence':
        shouldExecute = ['silent', 'silent_after_open', 'silent_after_click'].includes(engagementState);
        break;
      default:
        shouldExecute = true; // Default to time-based
    }

    if (!shouldExecute) {
      // A step waiting on the prospect used to leave next_action_at untouched,
      // so the dispatcher re-asked the same question every few minutes forever.
      // Back it off an hour: the answer cannot change faster than the prospect.
      const retryAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await supabase
        .from('sequence_enrollments')
        .update({ next_action_at: retryAt })
        .eq('id', enrollmentId);

      return new Response(JSON.stringify({
        success: true,
        action: 'skipped',
        reason: `Trigger condition "${triggerCondition}" not met for state "${engagementState}"`,
        retryAt,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Personalize the email template
    const lead = enrollment.lead;
    let subject = nextStep.subject_template;
    let body = nextStep.body_template;

    // Simple template variable replacement
    const replacements: Record<string, string> = {
      '{{first_name}}': lead?.contact_name?.split(' ')[0] || 'there',
      '{{full_name}}': lead?.contact_name || '',
      '{{company}}': lead?.company_name || '',
      '{{job_title}}': lead?.job_title || '',
      '{{industry}}': lead?.industry || '',
    };

    Object.entries(replacements).forEach(([key, value]) => {
      subject = subject.replace(new RegExp(key, 'g'), value);
      body = body.replace(new RegExp(key, 'g'), value);
    });

    const { data: snapRows } = lead?.id
      ? await supabase.from("research_snapshots").select("payload").eq("user_id", enrollment.user_id).eq("lead_id", lead.id)
      : { data: [] };
    const host = (() => {
      const raw = String(lead?.company_website ?? "");
      try { return new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.replace(/^www\./, ""); }
      catch { return null; }
    })();
    const evidenceDecision = evaluateStoredSnapshots({
      userId: String(enrollment.user_id ?? ""),
      leadId: String(lead?.id ?? ""),
      company: String(lead?.company_name ?? ""),
      websiteHost: host,
      now: new Date().toISOString(),
      stored: (snapRows ?? []).map((row: { payload?: unknown }) => row.payload).filter(Boolean),
    });
    const evidenceBlockers = bodyViolations(`${subject}\n${body}`, evidenceDecision);
    const copyBlockers = [...evidenceBlockers, ...queuedCopyBlockers(subject, body, proofFromLead(lead))];
    if (copyBlockers.length > 0) {
      const retryAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('sequence_enrollments')
        .update({ next_action_at: retryAt })
        .eq('id', enrollmentId)
        .eq('user_id', enrollment.user_id);
      console.warn(`[process-sequence-step] ${enrollmentId} copy held: ${copyBlockers.join('; ')}`);
      return new Response(JSON.stringify({
        success: false,
        action: 'skipped',
        reason: 'ungrounded_template',
        blockers: copyBlockers.slice(0, 5),
        retryAt,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create sent_email record (actual sending would be done by send-email function)
    const { data: sentEmail, error: emailError } = await supabase
      .from('sent_emails')
      .insert({
        user_id: enrollment.user_id,
        lead_id: enrollment.lead_id,
        to_email: lead?.contact_email || '',
        subject,
        body_text: htmlToPlainText(body),
        sequence_id: enrollment.sequence_id,
        sequence_step: nextStepNumber,
        enrollment_id: enrollmentId,
        // 'scheduled' + scheduled_at lets the process-scheduled-emails cron
        // pick this row up. 'pending' would leave it stranded forever.
        status: 'scheduled',
        scheduled_at: new Date().toISOString(),
        // The column defaults to now(); an unsent row must not claim a send time.
        sent_at: null,
      })
      .select()
      .single();

    if (emailError) {
      // 23505 is the unique step guard: another pass already queued this step.
      // Advance only if this enrollment is still on the old step, and do not
      // insert a second email.
      if (emailError.code === '23505') {
        await supabase
          .from('sequence_enrollments')
          .update({
            current_step: nextStepNumber,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', enrollmentId)
          .eq('current_step', enrollment.current_step)
          .eq('user_id', enrollment.user_id);
        return new Response(JSON.stringify({
          success: true,
          action: 'already_queued',
          nextStepNumber,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.error('Error creating sent email:', emailError);
      return new Response(JSON.stringify({ error: 'Failed to create email record' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate next action time
    const nextActionAt = new Date();
    nextActionAt.setDate(nextActionAt.getDate() + (nextStep.delay_days || 0));
    nextActionAt.setHours(nextActionAt.getHours() + (nextStep.delay_hours || 0));

    // Update enrollment
    await supabase
      .from('sequence_enrollments')
      .update({
        current_step: nextStepNumber,
        next_action_at: nextActionAt.toISOString(),
        last_activity_at: new Date().toISOString(),
        engagement_state: 'contacted',
      })
      .eq('id', enrollmentId)
      .eq('current_step', enrollment.current_step)
      .eq('user_id', enrollment.user_id);

    // Update lead engagement state
    await supabase
      .from('leads')
      .update({
        engagement_state: 'contacted',
        last_contacted_at: new Date().toISOString(),
      })
      .eq('id', enrollment.lead_id)
      .eq('user_id', enrollment.user_id);

    return new Response(JSON.stringify({
      success: true,
      action: 'email_queued',
      sentEmailId: sentEmail.id,
      nextStepNumber,
      nextActionAt: nextActionAt.toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in process-sequence-step:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
