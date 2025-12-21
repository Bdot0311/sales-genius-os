import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a B2B lead query parser. Convert natural language queries into structured filters for a lead generation system.

Extract the following fields from the query:
- jobTitles: Array of job titles (e.g., ["CEO", "CTO", "VP of Sales"])
- industries: Array of industries (e.g., ["SaaS", "Fintech", "Healthcare"])
- companySizes: Array of company size ranges (e.g., ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"])
- locations: Array of locations (e.g., ["California", "New York", "United States"])
- keywords: Array of additional keywords (e.g., ["AI", "Machine Learning", "Series A"])
- limit: Number of leads requested (default 50)

Return ONLY a valid JSON object with these fields. If a field is not mentioned, use an empty array or default value.`;

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
          { role: "user", content: `Parse this lead query: "${query}"` }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("Failed to parse query with AI");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    const filters = JSON.parse(jsonStr);
    
    console.log("Parsed query:", query, "->", filters);

    return new Response(JSON.stringify({ filters }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error parsing lead query:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Failed to parse query",
      filters: {
        jobTitles: [],
        industries: [],
        companySizes: [],
        locations: [],
        keywords: [],
        limit: 50
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
