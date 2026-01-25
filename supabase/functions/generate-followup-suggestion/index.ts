import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { leadName, companyName, originalSubject, leadEmail } = await req.json();

    if (!leadName || !companyName) {
      throw new Error("Missing required fields: leadName and companyName");
    }

    const prompt = `You are an expert B2B sales strategist. Generate a follow-up email suggestion for a sales rep who just sent an introductory cold email.

CONTEXT:
- Lead name: ${leadName}
- Company: ${companyName}
- Original email subject: ${originalSubject || "Introduction email"}
- Lead email: ${leadEmail || "Not provided"}

TASK: Create a strategic follow-up plan with:
1. A compelling subject line that references the original email (don't use "Re:" prefix, be creative)
2. A brief 3-4 sentence follow-up email body that:
   - References the previous email without being pushy
   - Adds new value or insight
   - Ends with a soft, permission-based CTA
3. Recommended number of days to wait before sending (typically 3-5 days)
4. A brief trigger context description for the CRM

CRITICAL RULES:
- Keep it SHORT (under 80 words for body)
- Be conversational, NOT salesy
- Add genuine value, don't just "check in"
- Reference something specific if possible

Respond in this EXACT JSON format:
{
  "suggestedSubject": "Subject line here",
  "suggestedBody": "Email body here with proper line breaks",
  "suggestedDays": 3,
  "triggerContext": "Brief description for CRM"
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an expert B2B sales copywriter. Always respond with valid JSON only, no markdown formatting." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to generate follow-up suggestion");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse the JSON response
    let suggestion;
    try {
      // Clean the response - remove any markdown code blocks if present
      const cleanedContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      suggestion = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      // Fallback suggestion
      suggestion = {
        suggestedSubject: `Quick thought for ${companyName}`,
        suggestedBody: `Hi ${leadName},\n\nWanted to circle back on my previous note. I've been thinking about how we might be able to help ${companyName}.\n\nWorth a quick 10-minute call to explore?\n\nBest,`,
        suggestedDays: 3,
        triggerContext: `Follow-up on introduction to ${leadName} at ${companyName}`,
      };
    }

    // Validate the suggestion structure
    if (!suggestion.suggestedSubject || !suggestion.suggestedBody || !suggestion.suggestedDays) {
      suggestion = {
        suggestedSubject: suggestion.suggestedSubject || `Following up - ${companyName}`,
        suggestedBody: suggestion.suggestedBody || `Hi ${leadName},\n\nJust following up on my previous email. Would love to connect if you have a moment.\n\nBest,`,
        suggestedDays: suggestion.suggestedDays || 3,
        triggerContext: suggestion.triggerContext || `Follow-up with ${leadName}`,
      };
    }

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-followup-suggestion:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
