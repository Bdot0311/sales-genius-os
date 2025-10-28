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
    const { question, userData } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context from user's sales data
    const context = `
User Sales Data:
- Total Leads: ${userData.totalLeads}
- Active Deals: ${userData.activeDeals}
- Pipeline Value: $${userData.pipelineValue}
- Average Deal Size: $${userData.avgDealSize}
- Close Rate: ${userData.closeRate}%
- Upcoming Meetings: ${userData.upcomingMeetings}
    `.trim();

    const systemPrompt = `You are an expert B2B sales coach with 20+ years of experience. You provide actionable, specific advice to help salespeople improve their performance. 

Your coaching style:
- Direct and actionable - give specific steps, not just theory
- Data-driven - reference the user's actual metrics when relevant
- Encouraging but honest - celebrate wins and address areas for improvement
- Practical - focus on what they can do today to improve

When analyzing their data:
- Benchmark against industry standards (avg close rate: 20-30%, avg response time: <4 hours)
- Identify specific opportunities (e.g., "You have X leads without follow-ups")
- Provide tactical next steps

Keep responses concise (2-3 paragraphs max) unless they ask for detailed analysis.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "system", content: context },
          { role: "user", content: question },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to get coaching response");
    }

    const data = await response.json();
    const coaching = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ coaching }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in ai-coach function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
