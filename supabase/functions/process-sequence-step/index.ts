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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { enrollmentId } = await req.json();

    if (!enrollmentId) {
      return new Response(JSON.stringify({ error: 'enrollmentId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get enrollment details
    const { data: enrollment, error: enrollmentError } = await supabase
      .from('sequence_enrollments')
      .select(`
        *,
        sequence:email_sequences(*),
        lead:leads(*)
      `)
      .eq('id', enrollmentId)
      .single();

    if (enrollmentError || !enrollment) {
      return new Response(JSON.stringify({ error: 'Enrollment not found' }), {
        status: 404,
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
        shouldExecute = nextStepNumber === 1;
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
      return new Response(JSON.stringify({
        success: true,
        action: 'skipped',
        reason: `Trigger condition "${triggerCondition}" not met for state "${engagementState}"`,
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

    // Create sent_email record (actual sending would be done by send-email function)
    const { data: sentEmail, error: emailError } = await supabase
      .from('sent_emails')
      .insert({
        user_id: enrollment.user_id,
        lead_id: enrollment.lead_id,
        to_email: lead?.contact_email || '',
        subject,
        body_text: body,
        sequence_id: enrollment.sequence_id,
        sequence_step: nextStepNumber,
        enrollment_id: enrollmentId,
        status: 'pending',
      })
      .select()
      .single();

    if (emailError) {
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
      .eq('id', enrollmentId);

    // Update lead engagement state
    await supabase
      .from('leads')
      .update({
        engagement_state: 'contacted',
        last_contacted_at: new Date().toISOString(),
      })
      .eq('id', enrollment.lead_id);

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
