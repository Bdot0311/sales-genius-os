import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { aiFetch } from "../_shared/ai-provider.ts";

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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const internalSecret = Deno.env.get('INTERNAL_TRIGGER_SECRET') ?? '';
    const isInternal = !!token && (token === supabaseKey || (!!internalSecret && token === internalSecret));

    const body = await req.json();
    const { replyContent, leadId, sentEmailId, conversationHistory, gmailMessageId, isAutoReply } = body;

    // The scheduled inbox sweep classifies replies on behalf of the mailbox
    // owner, so it authenticates internally and names the user.
    let user: { id: string } | null = null;
    if (isInternal) {
      if (!body.userId) {
        return new Response(JSON.stringify({ error: 'userId is required for internal calls' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      user = { id: body.userId };
    } else {
      const { data: { user: authedUser }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authedUser) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      user = { id: authedUser.id };
    }

    if (!replyContent) {
      return new Response(JSON.stringify({ error: 'Reply content is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get lead context if leadId provided
    let leadContext = '';
    if (leadId) {
      const { data: lead } = await supabase
        .from('leads')
        .select('contact_name, company_name, job_title, industry')
        .eq('id', leadId)
        .single();
      
      if (lead) {
        leadContext = `Lead: ${lead.contact_name} at ${lead.company_name}, ${lead.job_title || 'Unknown role'}, ${lead.industry || 'Unknown industry'}`;
      }
    }

    // Use Lovable AI for reply analysis
    const prompt = `You are an expert sales email reply analyst. Analyze this email reply and determine the prospect's intent level.

${leadContext}

Reply to analyze:
"""
${replyContent}
"""

${conversationHistory ? `Previous conversation context:\n${conversationHistory}` : ''}

Analyze and respond with ONLY a JSON object (no markdown, no explanation):
{
  "intent_score": <number 1-100, where 100 is highest buying intent>,
  "intent_classification": "<HIGH_INTENT|LOW_INTENT|NEUTRAL>",
  "triage_category": "<positive|soft_no|hard_no|ooo|wrong_person|info_request>",
  "priority": <1|2|3>,
  "detected_signals": {
    "has_question": <boolean - asking about features/pricing/demo>,
    "has_timing": <boolean - mentions timeline like Q2, next month, soon>,
    "has_objection": <boolean - pushback, concerns, already using competitor>,
    "has_positive": <boolean - interest, enthusiasm, wants to learn more>,
    "has_meeting_request": <boolean - asks for call/demo/meeting>,
    "has_auto_reply": <boolean - out of office, automated response>
  },
  "requires_human_action": <boolean>,
  "summary": "<one sentence summary of the reply intent>",
  "check_back_at": "<ISO date (YYYY-MM-DD) the prospect asked to be contacted, or null>",
  "suggested_reply": "<a short draft answer, or null — see the rules below>"
}

check_back_at rules:
- TODAY IS ${new Date().toISOString().slice(0, 10)}. Count every relative time from that date — "next quarter", "in a couple of months", "after the summer" mean nothing without it.
- Only when the prospect named a time: "March", "after Q2", "next quarter", "in a couple of months". Resolve it to a date.
- A bare "not right now" with no time in it is null. Guessing one invents permission to mail them again, and the sequence treats a dateless no as a no.
- Never a date in the past, and never further out than a year.

suggested_reply rules:
- Only when they asked something a reply can answer. Otherwise null.
- Answer the question they asked, in under four sentences, in their register.
- Never invent a price, a customer name, a metric or a case study. If the answer needs one you do not have, write the reply that asks for what you need to answer properly.
- It is a draft for a person to edit and send, not an email being sent now.

Classification rules:
- HIGH_INTENT (70-100): Questions about pricing/features, meeting requests, timeline mentions, comparisons with competitors
- LOW_INTENT (1-40): "Thanks", "Interesting", auto-replies, "not now", unsubscribe requests
- NEUTRAL (41-69): Vague interest, unclear signals, mixed messages

Triage category rules:
- positive: Interested, wants to proceed, asking buying questions, requesting demo or call
- soft_no: Not right now, reach out later, timing issue, "try me in Q3"
- hard_no: Not interested, remove me, unsubscribe, stop emailing
- ooo: Out of office, automated response, vacation reply
- wrong_person: Not the right contact, redirected to someone else, "try X instead"
- info_request: Asking for more information, pricing, a deck, or case studies before deciding

Priority rules:
- 1 (act today): positive or info_request — respond same day
- 2 (schedule follow-up): soft_no or wrong_person — add to follow-up queue
- 3 (no action): hard_no or ooo — remove or wait`;

    const aiResponse = await aiFetch("analyze-reply", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysisText = aiData.choices?.[0]?.message?.content || '';
    
    // Parse the JSON response
    let analysis;
    try {
      // Remove any markdown code blocks if present
      const cleanedText = analysisText.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', analysisText);
      // Default analysis if parsing fails
      analysis = {
        intent_score: 50,
        intent_classification: 'NEUTRAL',
        triage_category: 'soft_no',
        priority: 2,
        detected_signals: {
          has_question: false,
          has_timing: false,
          has_objection: false,
          has_positive: false,
          has_meeting_request: false,
          has_auto_reply: false,
        },
        requires_human_action: false,
        summary: 'Unable to analyze reply',
      };
    }

    // inbox-sync already identified this from the mail headers
    // (Auto-Submitted, X-Autoreply, Precedence) — evidence a model reading the
    // body cannot improve on. Overriding here keeps a chirpy "I am away until
    // Monday, contact Dana!" from being scored as interest.
    if (isAutoReply) {
      analysis = {
        ...analysis,
        intent_score: Math.min(Number(analysis?.intent_score ?? 10), 10),
        intent_classification: 'LOW_INTENT',
        triage_category: 'ooo',
        priority: 3,
        detected_signals: { ...(analysis?.detected_signals ?? {}), has_auto_reply: true },
        requires_human_action: false,
        summary: analysis?.summary || 'Out-of-office auto-reply',
      };
    }

    const triage: string = analysis.triage_category || 'soft_no';

    /*
     * A date the model named, trusted only when it is one.
     *
     * An unparseable string, a date in the past, or one more than a year out
     * is treated as no date at all — and a dateless "not now" stops the
     * sequence rather than holding it, so a bad parse can only ever stop mail
     * going out. That is the direction this guess is allowed to fail in.
     */
    const MAX_HOLD_MS = 365 * 24 * 60 * 60 * 1000;
    let checkBackAt: string | null = null;
    if (typeof analysis.check_back_at === 'string') {
      const parsed = Date.parse(analysis.check_back_at);
      if (Number.isFinite(parsed) && parsed > Date.now() && parsed - Date.now() <= MAX_HOLD_MS) {
        checkBackAt = new Date(parsed).toISOString();
      }
    }

    // An auto-reply asks nothing, so it gets no draft however the model felt.
    const suggestedReply: string | null =
      !isAutoReply && typeof analysis.suggested_reply === 'string' && analysis.suggested_reply.trim()
        ? analysis.suggested_reply.trim().slice(0, 4000)
        : null;

    // Store the analysis in the database
    const { data: replyAnalysis, error: insertError } = await supabase
      .from('reply_analysis')
      .insert({
        user_id: user.id,
        lead_id: leadId || null,
        sent_email_id: sentEmailId || null,
        reply_content: replyContent,
        intent_score: analysis.intent_score,
        intent_classification: analysis.intent_classification.toLowerCase(),
        detected_signals: {
          ...analysis.detected_signals,
          triage_category: analysis.triage_category || 'soft_no',
          priority: analysis.priority ?? 2,
          ...(gmailMessageId ? { gmail_message_id: gmailMessageId } : {}),
        },
        requires_human_action: analysis.requires_human_action,
        check_back_at: checkBackAt,
        suggested_reply: suggestedReply,
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error storing reply analysis:', insertError);
    }

    /*
     * Act on the reply, rather than only recording it.
     *
     * Until now this function ended here. `process-sequence-step` has always
     * carried `if (enrollment.engagement_state === 'replied')`, and that read
     * was the only reference to the value in the repository — nothing wrote
     * it, so the guard never fired and a prospect who answered kept receiving
     * the rest of the sequence.
     *
     * The decision itself lives in one SQL function because it is three writes
     * that have to agree. Failure is logged and not thrown: the classification
     * is already stored, and losing it as well would leave no record at all.
     */
    let sequenceOutcome: unknown = null;
    if (leadId) {
      const { data: applied, error: applyError } = await supabase.rpc('apply_reply_to_sequence', {
        p_user_id: user.id,
        p_lead_id: leadId,
        p_triage: triage,
        p_check_back_at: checkBackAt,
      });
      if (applyError) {
        console.error('[analyze-reply] reply not applied to the sequence:', applyError.message);
      } else {
        sequenceOutcome = applied;
        console.log('[analyze-reply] sequence outcome:', JSON.stringify(applied));
      }
    }

    /*
     * A question gets an answer waiting, not a notification saying one is
     * owed. The draft is stored for the user to edit and send — nothing here
     * sends it, and nothing here decides it is good enough to send.
     */
    let draftId: string | null = null;
    if (suggestedReply && leadId) {
      const { data: draft, error: draftError } = await supabase
        .from('email_drafts')
        /*
         * Upsert, because `email_drafts_user_lead_key` allows one draft per
         * user per lead. A plain insert raised a unique violation whenever an
         * outreach draft already existed for this lead — which is the common
         * case, since the lead was being emailed — and the branch below only
         * logged it, so the answer was lost in silence.
         *
         * The reply supersedes: an unsent first-touch draft to someone who has
         * now written to you is no longer the thing to send, and their
         * question is. trigger_context says where it came from so the previous
         * draft's absence is explainable.
         */
        .upsert({
          user_id: user.id,
          lead_id: leadId,
          subject: `Re: ${(analysis.summary ?? 'your reply').toString().slice(0, 120)}`,
          body: suggestedReply,
          trigger_context: `Drafted from their reply — ${triage}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,lead_id' })
        .select('id')
        .maybeSingle();
      if (draftError) {
        console.error('[analyze-reply] draft answer not stored:', draftError.message);
      } else {
        draftId = draft?.id ?? null;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: {
        ...analysis,
        triage_category: triage,
        priority: analysis.priority ?? 2,
        id: replyAnalysis?.id,
        check_back_at: checkBackAt,
        suggested_reply: suggestedReply,
      },
      sequence: sequenceOutcome,
      draft_id: draftId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in analyze-reply:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
