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

    const { leadName, companyName, originalSubject, leadEmail, jobTitle, industry, companyDescription, technologies } = await req.json();

    if (!leadName || !companyName) {
      throw new Error("Missing required fields: leadName and companyName");
    }

    const leadContext = [
      `- Lead name: ${leadName}`,
      `- Company: ${companyName}`,
      `- Original email subject: ${originalSubject || "Introduction email"}`,
      jobTitle ? `- Job Title: ${jobTitle}` : null,
      industry ? `- Industry: ${industry}` : null,
      companyDescription ? `- Company Description: ${companyDescription}` : null,
      technologies && technologies.length > 0 ? `- Technologies: ${technologies.slice(0, 5).join(', ')}` : null,
    ].filter(Boolean).join('\n');

    const prompt = `You are a senior B2B sales rep writing a follow-up email after an initial cold outreach.

CONTEXT:
${leadContext}

TASK: Create a strategic follow-up with:
1. A subject line (max 6 words, lowercase except proper nouns, specific to this lead or company — not generic)
2. A 2-3 sentence follow-up email body that:
   - References the prior email in one sentence: "Sent you a note last week about X"
   - Adds ONE new angle or proof point not in the first email
   - Ends with a casual, direct CTA: "Still open to a quick look?", "Any thoughts?", "Worth another look?"
3. Recommended days before sending (3-5)
4. A brief CRM trigger context

HARD RULES:
- Email body under 60 words. Hard ceiling.
- Tone: casual and confident, not apologetic or needy
- Sign-off: first name only — no "Best,", no "Thanks,"
- NEVER: "just following up", "circling back", "bumping this", "checking in", "I hope this finds you well"
- NEVER: "I noticed that", "I came across", "I was impressed by", "I've been analyzing"
- Use EXACTLY ONE specific data point from the lead context
- NEVER fabricate facts, company names, or metrics not in the provided data

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
        model: "google/gemini-2.5-flash",
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
        suggestedSubject: `re: outreach to ${companyName}`,
        suggestedBody: `Hi ${leadName.split(' ')[0]},\n\nSent you a note last week — wanted to add one more angle in case it's useful.\n\nStill open to a quick look?\n\n${leadName.split(' ')[0]}`,
        suggestedDays: 3,
        triggerContext: `Follow-up on introduction to ${leadName} at ${companyName}`,
      };
    }

    // Validate the suggestion structure
    if (!suggestion.suggestedSubject || !suggestion.suggestedBody || !suggestion.suggestedDays) {
      suggestion = {
        suggestedSubject: suggestion.suggestedSubject || `re: ${companyName} outreach`,
        suggestedBody: suggestion.suggestedBody || `Hi ${leadName.split(' ')[0]},\n\nSent you a note last week — still think there's something here worth a look.\n\nOpen to a quick call?\n\n${leadName.split(' ')[0]}`,
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
