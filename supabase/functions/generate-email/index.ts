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
const VALID_GOALS = ['introduction', 'follow-up', 'meeting', 'demo', 'proposal', 'subject_only', 'custom'];
const VALID_OPENERS = ['you', 'saw', 'how', 'spoke', 'noticed', 'referred', 'remember'];

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

// Cold Email Framework Prompt
const COLD_EMAIL_FRAMEWORK = `
You are an expert cold email copywriter using proven frameworks that achieve high response rates.

## COLD EMAIL FRAMEWORK - Follow this EXACTLY:

Write emails using EXACTLY 4 sentences:

**SENTENCE 1 - TRIGGER/HOOK:**
Start with ONE of these 7 words: You, Saw, How, Spoke, Noticed, Referred, Remember
Reference something specific about the prospect that shows you did your research.
Examples:
- "Saw you recently raised Series A from Accel..."
- "Noticed you just expanded your sales team with 3 new hires..."
- "How are you currently preparing reports for your board?"

**SENTENCE 2 - PAIN POINT + QUESTION:**
State a common problem they likely face based on their role/industry and ask about their current state.
End with a relatable question that invites them to think about their situation.
Example: "They mentioned prior to using [Company] board prep took days — gathering data and converting them into reports. Any chance you can relate?"

**SENTENCE 3 - VALUE + SOCIAL PROOF:**
Briefly explain what you do with specific social proof (customer names, results, metrics).
Example: "We help cut that time in half by layering AI on top of your FP&A tools like Abacum."

**SENTENCE 4 - PERMISSION-BASED CTA:**
End with a low-friction, permission-based ask. Never be pushy.
Examples: "Want to see how?", "Worth a quick chat?", "Open to exploring this?", "Mind if I share more?"

## EXAMPLE OF A PERFECT COLD EMAIL:

Hi Matt,

Saw that you are backed by Accel Ventures. Spot and Ignite are customers of ours today.

They mentioned prior to using [Company] board prep took days — gathering data and converting them into reports. Any chance you can relate?

We help cut that time in half by layering AI on top of your FP&A tools like Abacum.

Want to see how?

## RULES:
- Keep it SHORT (4 sentences max, under 100 words total)
- Be conversational, not salesy
- Personalize based on the lead's company, role, and industry
- Never use filler words or generic openings like "I hope this email finds you well"
- Never mention "cold email" or that you're "reaching out"
`;

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
    const subjectLine = typeof requestData.subjectLine === 'string' ? requestData.subjectLine.trim() : '';
    const triggerContext = typeof requestData.triggerContext === 'string' ? requestData.triggerContext.trim() : '';
    const openerWord = typeof requestData.openerWord === 'string' ? requestData.openerWord.trim().toLowerCase() : '';
    const socialProof = typeof requestData.socialProof === 'string' ? requestData.socialProof.trim() : '';

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
    const sanitizedJobTitle = lead.job_title ? sanitizeString(lead.job_title, 100) : 'Not specified';
    const sanitizedDepartment = lead.department ? sanitizeString(lead.department, 100) : 'Not specified';
    const sanitizedSeniority = lead.seniority ? sanitizeString(lead.seniority, 50) : 'Not specified';
    const sanitizedTechnologies = lead.technologies ? lead.technologies.slice(0, 10).join(', ') : 'Not specified';

    let systemPrompt: string;
    let userPrompt: string;

    if (goal === 'subject_only') {
      // Generate just a subject line using the cold email approach
      systemPrompt = `You are an expert cold email copywriter. Generate compelling, curiosity-inducing email subject lines that are personalized and relevant.
      
RULES for subject lines:
- Keep under 50 characters
- Be specific and personalized
- Create curiosity without being clickbait
- Reference something about their company/role when possible
- Never use spam trigger words`;
      
      userPrompt = `Generate a single compelling email subject line for the following lead. The subject should be ${tone} in tone.

Lead Information:
- Name: ${sanitizedContactName}
- Company: ${sanitizedCompanyName}
- Job Title: ${sanitizedJobTitle}
- Industry: ${sanitizedIndustry}
- Company Size: ${sanitizedCompanySize}
${triggerContext ? `- Trigger/Context: ${triggerContext}` : ''}

Return ONLY the subject line text, nothing else. No quotes, no "Subject:" prefix, just the subject line itself.`;
    } else if (goal === 'custom' && subjectLine) {
      // Generate email body based on custom subject line using cold email framework
      systemPrompt = `${COLD_EMAIL_FRAMEWORK}

The email should be ${tone} in tone and must relate to the provided subject line.

IMPORTANT: Generate ONLY the email body content. Do NOT include:
- Subject line or "Subject:" prefix
- Email headers
- Any meta information

Start directly with the greeting (e.g., "Hi ${sanitizedContactName},") and end with the signature.`;

      userPrompt = `Write a cold email BODY ONLY that matches this subject line: "${subjectLine}"

Lead Information:
- Name: ${sanitizedContactName}
- Company: ${sanitizedCompanyName}
- Job Title: ${sanitizedJobTitle}
- Department: ${sanitizedDepartment}
- Seniority: ${sanitizedSeniority}
- Industry: ${sanitizedIndustry}
- Company Size: ${sanitizedCompanySize}
- Technologies Used: ${sanitizedTechnologies}
- ICP Score: ${lead.icp_score || 0}/100
${triggerContext ? `\nTrigger/Context (use this as your opener): ${triggerContext}` : ''}
${openerWord && VALID_OPENERS.includes(openerWord) ? `\nPreferred Opening Word: Start with "${openerWord.charAt(0).toUpperCase() + openerWord.slice(1)}"` : ''}
${socialProof ? `\nSocial Proof to include: ${socialProof}` : ''}

Write an email body following the 4-sentence cold email framework. Start with the greeting and end with a simple sign-off. Do NOT include the subject line.`;
    } else {
      // Standard cold email generation using the framework
      systemPrompt = `${COLD_EMAIL_FRAMEWORK}

The email should be ${tone} in tone and focused on ${goal}.

IMPORTANT: Generate ONLY the email body content. Do NOT include:
- Subject line or "Subject:" prefix
- Email headers
- Any meta information

Start directly with the greeting (e.g., "Hi ${sanitizedContactName},") and end with a simple sign-off.`;

      userPrompt = `Write a cold email BODY ONLY (no subject line) for the following lead:
    
Lead Information:
- Name: ${sanitizedContactName}
- Company: ${sanitizedCompanyName}
- Job Title: ${sanitizedJobTitle}
- Department: ${sanitizedDepartment}
- Seniority: ${sanitizedSeniority}
- Industry: ${sanitizedIndustry}
- Company Size: ${sanitizedCompanySize}
- Technologies Used: ${sanitizedTechnologies}
- ICP Score: ${lead.icp_score || 0}/100
${triggerContext ? `\nTrigger/Context (use this as your opener): ${triggerContext}` : ''}
${openerWord && VALID_OPENERS.includes(openerWord) ? `\nPreferred Opening Word: Start with "${openerWord.charAt(0).toUpperCase() + openerWord.slice(1)}"` : ''}
${socialProof ? `\nSocial Proof to include: ${socialProof}` : ''}

Goal: ${goal}

Write ONLY the email body following the 4-sentence cold email framework:
1. Trigger/Hook (start with ${openerWord || 'one of: You, Saw, How, Spoke, Noticed, Referred, Remember'})
2. Pain point + question about their current state
3. Value proposition + social proof
4. Permission-based CTA

Start with the greeting and end with a simple sign-off like "Thanks," or "Best,". Do NOT include a subject line.`;
    }

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
    
    // Remove any subject line if AI still included it
    email = email.replace(/^Subject:.*\n+/i, '').trim();

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
