import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation helpers
const sanitizeString = (input: string, maxLength: number): string => {
  return input.trim().slice(0, maxLength);
};

const validateInputs = (data: any) => {
  const errors: string[] = [];
  
  if (!data.companyName || typeof data.companyName !== 'string') {
    errors.push('Company name is required');
  } else if (data.companyName.length > 100) {
    errors.push('Company name must be less than 100 characters');
  }
  
  if (data.industry && data.industry.length > 100) {
    errors.push('Industry must be less than 100 characters');
  }
  
  if (data.companySize && data.companySize.length > 50) {
    errors.push('Company size must be less than 50 characters');
  }
  
  if (data.contactName && data.contactName.length > 100) {
    errors.push('Contact name must be less than 100 characters');
  }
  
  if (data.notes && data.notes.length > 2000) {
    errors.push('Notes must be less than 2000 characters');
  }
  
  return errors;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
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

    const { companyName, industry, companySize, contactName, notes } = await req.json();

    // Validate inputs
    const validationErrors = validateInputs({ companyName, industry, companySize, contactName, notes });
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ error: validationErrors.join(', ') }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize inputs before sending to AI
    const sanitizedCompanyName = sanitizeString(companyName, 100);
    const sanitizedIndustry = industry ? sanitizeString(industry, 100) : 'Unknown';
    const sanitizedCompanySize = companySize ? sanitizeString(companySize, 50) : 'Unknown';
    const sanitizedContactName = contactName ? sanitizeString(contactName, 100) : 'Unknown';
    const sanitizedNotes = notes ? sanitizeString(notes, 2000) : 'None';

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a SaaS sales expert. Score leads on a scale of 0-100 based on their ideal customer profile (ICP) fit. 
            Consider: company size, industry, growth indicators, and other signals. 
            Return ONLY a JSON object with: { "score": number (0-100), "reasoning": "brief explanation", "recommendations": ["action1", "action2"] }`
          },
          {
            role: 'user',
            content: `Score this lead:
Company: ${sanitizedCompanyName}
Industry: ${sanitizedIndustry}
Company Size: ${sanitizedCompanySize}
Contact: ${sanitizedContactName}
Notes: ${sanitizedNotes}`
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits depleted. Please add credits to continue.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content;

    // Remove markdown code blocks if present
    content = content.trim();
    if (content.startsWith('```json')) {
      content = content.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (content.startsWith('```')) {
      content = content.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    // Parse the JSON response from AI
    const result = JSON.parse(content);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in score-lead function:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        score: 50,
        reasoning: 'Unable to score lead automatically. Manual review recommended.',
        recommendations: ['Review lead manually', 'Add more information']
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
