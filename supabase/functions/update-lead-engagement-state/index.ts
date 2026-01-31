import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Engagement state machine
type EngagementState = 
  | 'new'
  | 'contacted'
  | 'opened'
  | 'opened_no_click'
  | 'clicked'
  | 'silent_after_open'
  | 'silent_after_click'
  | 'replied';

type EmailEvent = 'sent' | 'opened' | 'clicked' | 'replied' | 'silence_check';

interface StateTransition {
  from: EngagementState[];
  to: EngagementState;
  condition?: (context: EventContext) => boolean;
}

interface EventContext {
  currentState: EngagementState;
  event: EmailEvent;
  lastOpenedAt?: string;
  lastClickedAt?: string;
  hoursSinceOpen?: number;
  hoursSinceClick?: number;
}

// State transition rules
const transitions: Record<EmailEvent, StateTransition[]> = {
  sent: [
    { from: ['new'], to: 'contacted' },
  ],
  opened: [
    { from: ['contacted', 'new'], to: 'opened' },
    { from: ['silent_after_open'], to: 'opened' },
  ],
  clicked: [
    { from: ['contacted', 'new', 'opened', 'opened_no_click', 'silent_after_open'], to: 'clicked' },
  ],
  replied: [
    { from: ['contacted', 'opened', 'opened_no_click', 'clicked', 'silent_after_open', 'silent_after_click', 'new'], to: 'replied' },
  ],
  silence_check: [
    { 
      from: ['opened'], 
      to: 'opened_no_click',
      condition: (ctx) => (ctx.hoursSinceOpen ?? 0) >= 1 && !ctx.lastClickedAt,
    },
    { 
      from: ['opened', 'opened_no_click'], 
      to: 'silent_after_open',
      condition: (ctx) => (ctx.hoursSinceOpen ?? 0) >= 48 && !ctx.lastClickedAt,
    },
    { 
      from: ['clicked'], 
      to: 'silent_after_click',
      condition: (ctx) => (ctx.hoursSinceClick ?? 0) >= 48,
    },
  ],
};

function getNextState(context: EventContext): EngagementState | null {
  const eventTransitions = transitions[context.event];
  if (!eventTransitions) return null;

  for (const transition of eventTransitions) {
    if (transition.from.includes(context.currentState)) {
      if (!transition.condition || transition.condition(context)) {
        return transition.to;
      }
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { leadId, event, userId, sentEmailId } = await req.json();

    if (!leadId || !event || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: leadId, event, userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current lead state
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('engagement_state, last_contacted_at')
      .eq('id', leadId)
      .eq('user_id', userId)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found", details: leadError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const currentState = (lead.engagement_state || 'new') as EngagementState;

    // Get latest email activity for context
    let hoursSinceOpen: number | undefined;
    let hoursSinceClick: number | undefined;
    let lastOpenedAt: string | undefined;
    let lastClickedAt: string | undefined;

    if (sentEmailId || event === 'silence_check') {
      const { data: emails } = await supabase
        .from('sent_emails')
        .select('opened_at, clicked_at')
        .eq('lead_id', leadId)
        .eq('user_id', userId)
        .not('opened_at', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(1);

      if (emails && emails.length > 0) {
        const email = emails[0];
        if (email.opened_at) {
          lastOpenedAt = email.opened_at;
          hoursSinceOpen = (Date.now() - new Date(email.opened_at).getTime()) / (1000 * 60 * 60);
        }
        if (email.clicked_at) {
          lastClickedAt = email.clicked_at;
          hoursSinceClick = (Date.now() - new Date(email.clicked_at).getTime()) / (1000 * 60 * 60);
        }
      }
    }

    const context: EventContext = {
      currentState,
      event: event as EmailEvent,
      lastOpenedAt,
      lastClickedAt,
      hoursSinceOpen,
      hoursSinceClick,
    };

    const nextState = getNextState(context);

    if (!nextState || nextState === currentState) {
      return new Response(
        JSON.stringify({ 
          message: "No state change required",
          currentState,
          event,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update lead engagement state
    const { error: updateError } = await supabase
      .from('leads')
      .update({ 
        engagement_state: nextState,
        ...(event === 'sent' ? { last_contacted_at: new Date().toISOString() } : {}),
      })
      .eq('id', leadId)
      .eq('user_id', userId);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update lead state", details: updateError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If lead is in a sequence, update enrollment state too
    const { data: enrollment } = await supabase
      .from('sequence_enrollments')
      .select('id, status')
      .eq('lead_id', leadId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .single();

    if (enrollment) {
      await supabase
        .from('sequence_enrollments')
        .update({ 
          engagement_state: nextState,
          last_activity_at: new Date().toISOString(),
          // Auto-exit sequence on reply
          ...(nextState === 'replied' ? { status: 'completed', completed_at: new Date().toISOString() } : {}),
        })
        .eq('id', enrollment.id);
    }

    console.log(`Lead ${leadId} state updated: ${currentState} -> ${nextState} (event: ${event})`);

    return new Response(
      JSON.stringify({ 
        success: true,
        previousState: currentState,
        newState: nextState,
        event,
        leadId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error updating engagement state:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
