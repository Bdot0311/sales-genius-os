import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Input validation helpers
const sanitizeString = (input: string, maxLength: number): string => {
  return input.trim().slice(0, maxLength);
};

const VALID_TONES = ['professional', 'friendly', 'casual', 'formal'];
const VALID_GOALS = ['introduction', 'follow-up', 'meeting', 'demo', 'proposal'];

const validateEmailInputs = (data: any) => {
  const errors: string[] = [];
  
  if (!data.lead || typeof data.lead !== 'object') {
    errors.push('Lead data is required');
  }
  
  const tone = typeof data.tone === 'string' ? data.tone.trim().toLowerCase() : '';
  if (!tone || !VALID_TONES.includes(tone)) {
    errors.push('Valid tone is required (professional, friendly, casual, or formal)');
  }
  
  const goal = typeof data.goal === 'string' ? data.goal.trim().toLowerCase() : '';
  if (!goal || !VALID_GOALS.includes(goal)) {
    errors.push('Valid goal is required (introduction, follow-up, meeting, demo, or proposal)');
  }
  
  return errors;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestData = await req.json();
    const lead = requestData.lead;
    const tone = typeof requestData.tone === 'string' ? requestData.tone.trim().toLowerCase() : '';
    const goal = typeof requestData.goal === 'string' ? requestData.goal.trim().toLowerCase() : '';

    // Validate inputs
    const validationErrors = validateEmailInputs({ lead, tone, goal });
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ error: validationErrors.join(', ') }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user owns the lead
    const { data: leadData, error: leadError } = await supabaseClient
      .from('leads')
      .select('id, user_id')
      .eq('id', lead.id)
      .single();

    if (leadError || !leadData || leadData.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Lead not found or unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Sanitize lead data
    const sanitizedContactName = sanitizeString(lead.contact_name || 'there', 100);
    const sanitizedCompanyName = sanitizeString(lead.company_name || 'your company', 100);
    const sanitizedIndustry = lead.industry ? sanitizeString(lead.industry, 100) : 'Not specified';
    const sanitizedCompanySize = lead.company_size ? sanitizeString(lead.company_size, 50) : 'Not specified';

    const systemPrompt = `You are an expert sales email writer. Generate a personalized, compelling email based on the lead information and goal provided. The email should be ${tone} in tone and focused on ${goal}.`;

    const userPrompt = `Write a sales email for the following lead:
    
Lead Information:
- Name: ${sanitizedContactName}
- Company: ${sanitizedCompanyName}
- Industry: ${sanitizedIndustry}
- Company Size: ${sanitizedCompanySize}
- ICP Score: ${lead.icp_score || 0}/100

Goal: ${goal}

Write a personalized email that addresses their potential needs and includes a clear call to action. Keep it concise and engaging.`;

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let email = data.choices[0].message.content;

    // Remove markdown code blocks if present
    email = email.trim();
    if (email.startsWith('```')) {
      email = email.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
    }

    return new Response(JSON.stringify({ email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in generate-email function:", error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate email' }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
