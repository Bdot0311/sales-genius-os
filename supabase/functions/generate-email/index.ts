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
const VALID_GOALS = ['introduction', 'follow-up', 'meeting', 'demo', 'proposal', 'subject_only', 'custom', 'trigger_context', 'social_proof'];
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

// Cold Email Framework Prompt - Sales-Focused for Booking Meetings
const COLD_EMAIL_FRAMEWORK = `
You are an elite B2B sales copywriter who specializes in cold emails that BOOK MEETINGS and CLOSE DEALS.
Your emails have a 40%+ open rate and 15%+ reply rate because you follow proven frameworks.

## COLD EMAIL FRAMEWORK - Follow this EXACTLY:

Write emails using EXACTLY 4 sentences:

**SENTENCE 1 - TRIGGER/HOOK (The Pattern Interrupt):**
Start with ONE of these 7 power words: You, Saw, How, Spoke, Noticed, Referred, Remember
Reference something SPECIFIC and RECENT about the prospect that shows you researched them.
This creates instant credibility and curiosity.
Examples:
- "Saw you recently raised Series A from Accel..."
- "Noticed you just expanded your sales team with 3 new SDRs..."
- "You've been scaling fast since your product launch last month..."

**SENTENCE 2 - PAIN POINT + EMPATHY QUESTION:**
State their likely pain point based on their role/company stage, then ask a relatable question.
Make them feel understood. This builds trust and gets them nodding.
Example: "They mentioned before using us, board prep took days, gathering data from 12 different tools. Any chance you can relate?"

**SENTENCE 3 - VALUE + SOCIAL PROOF (Credibility Stack):**
Briefly explain what you do with SPECIFIC social proof: company names, metrics, results.
Use numbers and named customers for maximum impact.
Example: "We helped Stripe and Notion cut that prep time by 70% in week one."

**SENTENCE 4 - PERMISSION-BASED CTA (Low-Friction Ask):**
End with a soft, permission-based ask. Never be pushy or assumptive.
Examples: "Worth a quick look?", "Open to exploring this?", "Mind if I share how?", "Worth 15 min to see if there's a fit?"

## PERFECT COLD EMAIL EXAMPLE:

Hi Matt,

Saw that you're backed by Accel Ventures, congrats on the recent close.

Spot and Ignite are customers of ours, and they mentioned board prep used to take days before switching. Any chance you can relate?

We help cut that time by 70% by layering AI on top of tools like Abacum.

Worth a quick look?

Best,

## CRITICAL RULES:
- MAXIMUM 100 words total (brevity = professionalism)
- Be conversational and human, NEVER salesy or pushy
- Personalize deeply using ALL available lead data
- NEVER use generic filler: "I hope this finds you well", "reaching out", "touching base"
- NEVER mention this is a "cold email" or that you're "prospecting"
- Focus on THEIR pain, not your product features
- The goal is to spark curiosity and book a meeting, NOT to sell
- End with a signature that just says "Best," or "Thanks," and nothing more
- **NEVER fabricate facts, company names, metrics, or claims.** Do NOT invent customer names, revenue figures, funding rounds, or results you cannot verify. If specific social proof is not provided by the user, use generic but HONEST phrasing like "teams like yours" or "companies in [industry]" instead of making up names and numbers.
- **NEVER make false advertising claims.** Do not promise specific ROI, percentages, or outcomes unless the user explicitly provides them. Saying "we helped [fake company] cut costs by 70%" when that is not true is unacceptable.
- If trigger/context info is vague or unavailable, use a genuine, general opener rather than inventing a fake trigger event (e.g., don't invent a funding round or product launch that didn't happen).
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
    const businessDescription = typeof requestData.businessDescription === 'string' ? requestData.businessDescription.trim().slice(0, 500) : '';
    const variantNum = typeof requestData.variantNum === 'number' ? requestData.variantNum : 0;

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
- Never use spam trigger words
- CRITICAL: Every generation must produce a COMPLETELY DIFFERENT subject line. Never reuse the same structure, phrasing, or angle twice. Vary your approach drastically each time — try different hooks: questions, statements, name drops, industry references, role-specific angles, company-specific angles, metric-based, outcome-based, pain-based, curiosity-based, etc.`;
      
      userPrompt = `Generate a single compelling email subject line for the following lead. The subject should be ${tone} in tone.

IMPORTANT: This is generation attempt #${Date.now() % 1000}. You MUST produce a completely unique subject line that is different from any previous generation. Use a fresh angle, structure, and wording.

Lead Information:
- Name: ${sanitizedContactName}
- Company: ${sanitizedCompanyName}
- Job Title: ${sanitizedJobTitle}
- Industry: ${sanitizedIndustry}
- Company Size: ${sanitizedCompanySize}
${triggerContext ? `- Trigger/Context: ${triggerContext}` : ''}
${businessDescription ? `\nSender's Business Description: ${businessDescription}` : ''}

Return ONLY the subject line text, nothing else. No quotes, no "Subject:" prefix, just the subject line itself.`;
    } else if (goal === 'trigger_context') {
      // Generate personalized trigger context opener
      systemPrompt = `You are an expert B2B sales researcher. Generate a personalized trigger/context opener for cold emails.

RULES:
- Start with one of these 7 power words: You, Saw, How, Spoke, Noticed, Referred, Remember
- Reference something about the prospect based ONLY on the data provided (job title, industry, company size, etc.)
- Do NOT invent or fabricate events like funding rounds, product launches, or hiring news unless explicitly provided in the lead data.
- Keep it under 50 words
- Make it feel personal and researched using only real, provided information
- Be genuine, not sycophantic
- CRITICAL: Every generation must produce a COMPLETELY DIFFERENT trigger line. Never reuse the same structure, angle, or phrasing. Rotate between different power words. Vary the focus: sometimes highlight the person's role, sometimes the company's growth, sometimes the industry challenge, sometimes the team size, sometimes a technology angle. Be wildly creative while staying truthful.`;

      userPrompt = `Generate a personalized trigger/context opener for this lead:

IMPORTANT: This is generation attempt #${Date.now() % 1000}. You MUST produce a completely unique trigger line — different structure, different angle, different power word from any previous attempt.

Lead Information:
- Name: ${sanitizedContactName}
- Company: ${sanitizedCompanyName}
- Job Title: ${sanitizedJobTitle}
- Industry: ${sanitizedIndustry}
- Company Size: ${sanitizedCompanySize}
- Seniority: ${sanitizedSeniority}
${openerWord && VALID_OPENERS.includes(openerWord) ? `\nPreferred Opening Word: Start with "${openerWord.charAt(0).toUpperCase() + openerWord.slice(1)}"` : ''}
${businessDescription ? `\nSender's Business Description: ${businessDescription}` : ''}

Return ONLY the trigger context sentence, nothing else. No quotes, no explanations. Just the opener text.`;
    } else if (goal === 'social_proof') {
      // Generate social proof text
      systemPrompt = `You are an expert B2B sales copywriter. Generate compelling social proof text for cold emails.

RULES:
- Do NOT invent or fabricate company names, customer names, or specific metrics/results.
- If the user has not provided real social proof data, use honest generic phrasing like "teams in [industry]" or "companies like yours" instead of making up names.
- Only include specific company names or metrics if the user explicitly provides them.
- Keep it under 40 words
- Make it relevant to the prospect's industry/role
- Format should sound credible and honest, e.g., "We work with teams in [industry] to help them [general benefit]."`;
      
      userPrompt = `Generate social proof text relevant to this lead:

Lead Information:
- Name: ${sanitizedContactName}
- Company: ${sanitizedCompanyName}
- Job Title: ${sanitizedJobTitle}
- Industry: ${sanitizedIndustry}
- Company Size: ${sanitizedCompanySize}
${businessDescription ? `\nSender's Business Description (use this to make social proof relevant): ${businessDescription}` : ''}

Return ONLY the social proof text, nothing else. No quotes, no explanations. Example format: "Spot and Ignite are customers of ours. We helped them cut board prep time by 50%."`;
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
${businessDescription ? `\nSender's Business Description (use this to accurately describe what the sender's company does AND derive social proof / customer references from it): ${businessDescription}` : ''}

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
${businessDescription ? `\nSender's Business Description (use this to accurately describe what the sender's company does AND derive social proof / customer references from it): ${businessDescription}` : ''}

Goal: ${goal}

Write ONLY the email body following the 4-sentence cold email framework:
1. Trigger/Hook (start with ${openerWord || 'one of: You, Saw, How, Spoke, Noticed, Referred, Remember'})
2. Pain point + question about their current state
3. Value proposition + social proof
4. Permission-based CTA

Start with the greeting and end with a simple sign-off like "Thanks," or "Best,". Do NOT include a subject line.`;
    }

    // Use higher temperature for maximum variety on every generation
    const temperature = variantNum > 0 ? 1.0 : 0.95;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt + (variantNum > 0 ? `\n\n[Generate a UNIQUE variant #${variantNum} - be creative with different angles and approaches while maintaining the framework]` : '') },
        ],
        temperature,
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
