import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HandoffTrigger {
  type: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { enrollmentId, replyAnalysisId, leadId, userId } = await req.json();

    if (!enrollmentId || !userId) {
      return new Response(JSON.stringify({ error: 'enrollmentId and userId are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the user's subscription to check plan level
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', userId)
      .single();

    const plan = subscription?.plan || 'growth';
    
    // Growth plan doesn't have handoff alerts
    if (plan === 'growth') {
      return new Response(JSON.stringify({
        success: true,
        handoffTriggered: false,
        reason: 'Handoff alerts not available on Growth plan',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const triggers: HandoffTrigger[] = [];

    // Get reply analysis if provided
    if (replyAnalysisId) {
      const { data: analysis } = await supabase
        .from('reply_analysis')
        .select('*')
        .eq('id', replyAnalysisId)
        .single();

      if (analysis) {
        const signals = analysis.detected_signals as Record<string, boolean>;

        // Trigger 1: High intent score
        if (analysis.intent_score >= 70) {
          triggers.push({
            type: 'high_intent',
            reason: `High intent score detected (${analysis.intent_score}/100)`,
            priority: 'high',
          });
        }

        // Trigger 2: Reply contains a question
        if (signals?.has_question) {
          triggers.push({
            type: 'question',
            reason: 'Reply contains a question requiring response',
            priority: 'high',
          });
        }

        // Trigger 3: Timing mention
        if (signals?.has_timing) {
          triggers.push({
            type: 'timing',
            reason: 'Reply mentions timing or timeline',
            priority: 'medium',
          });
        }

        // Trigger 4: Objection/pushback
        if (signals?.has_objection) {
          triggers.push({
            type: 'objection',
            reason: 'Pushback or objection detected - needs handling',
            priority: 'high',
          });
        }

        // Trigger 5: Meeting request
        if (signals?.has_meeting_request) {
          triggers.push({
            type: 'meeting_request',
            reason: 'Prospect requested a meeting or demo',
            priority: 'high',
          });
        }
      }
    }

    // Check for behavioral triggers from lead engagement
    if (leadId) {
      const { data: lead } = await supabase
        .from('leads')
        .select('engagement_state')
        .eq('id', leadId)
        .single();

      // Trigger: Click detected (high intent behavior)
      if (lead?.engagement_state === 'clicked') {
        triggers.push({
          type: 'link_click',
          reason: 'Prospect clicked a link in your email',
          priority: 'medium',
        });
      }
    }

    // If triggers detected, pause the enrollment
    if (triggers.length > 0) {
      const highestPriority = triggers.find(t => t.priority === 'high') || triggers[0];
      
      const { error: updateError } = await supabase
        .from('sequence_enrollments')
        .update({
          status: 'paused',
          paused_reason: `${highestPriority.type}: ${highestPriority.reason}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrollmentId);

      if (updateError) {
        console.error('Error pausing enrollment:', updateError);
      }

      // For Pro plan, could trigger webhook here
      if (plan === 'pro') {
        // TODO: Implement webhook/Slack notification for Pro users
        console.log('Pro user - would send webhook notification');
      }

      // For Pro+, send email notification
      // TODO: Implement email notification
      console.log('Pro+ user - would send email notification');

      return new Response(JSON.stringify({
        success: true,
        handoffTriggered: true,
        triggers,
        pausedReason: `${highestPriority.type}: ${highestPriority.reason}`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      handoffTriggered: false,
      triggers: [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in check-handoff-triggers:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
