import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { replyContent, leadId, sentEmailId, conversationHistory } = await req.json();

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
  "detected_signals": {
    "has_question": <boolean - asking about features/pricing/demo>,
    "has_timing": <boolean - mentions timeline like Q2, next month, soon>,
    "has_objection": <boolean - pushback, concerns, already using competitor>,
    "has_positive": <boolean - interest, enthusiasm, wants to learn more>,
    "has_meeting_request": <boolean - asks for call/demo/meeting>,
    "has_auto_reply": <boolean - out of office, automated response>
  },
  "requires_human_action": <boolean>,
  "summary": "<one sentence summary of the reply intent>"
}

Classification rules:
- HIGH_INTENT (70-100): Questions about pricing/features, meeting requests, timeline mentions, comparisons with competitors
- LOW_INTENT (1-40): "Thanks", "Interesting", auto-replies, "not now", unsubscribe requests
- NEUTRAL (41-69): Vague interest, unclear signals, mixed messages`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        detected_signals: analysis.detected_signals,
        requires_human_action: analysis.requires_human_action,
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error storing reply analysis:', insertError);
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: {
        ...analysis,
        id: replyAnalysis?.id,
      },
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
