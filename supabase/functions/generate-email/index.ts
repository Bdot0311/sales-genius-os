import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Input validation ──────────────────────────────────────────────────────────
const sanitizeString = (input: string, maxLength: number): string =>
  input.trim().slice(0, maxLength);

const VALID_TONES    = ['professional', 'friendly', 'casual', 'formal'];
const VALID_GOALS    = ['introduction', 'follow-up', 'meeting', 'demo', 'proposal', 'subject_only', 'custom', 'trigger_context', 'social_proof', '4ts', 'elusive', 'proximity', '4ps_followup', '4ps_elusive_followup'];
const VALID_OPENERS  = ['you', 'saw', 'how', 'spoke', 'noticed', 'referred', 'remember'];
const FRAMEWORK_GOALS = new Set(['4ts', 'elusive', 'proximity', '4ps_followup', '4ps_elusive_followup']);

const validateEmailInputs = (data: any) => {
  const errors: string[] = [];
  if (!data.lead || typeof data.lead !== 'object') errors.push('Lead data is required');
  const tone = typeof data.tone === 'string' ? data.tone.trim().toLowerCase() : '';
  if (!tone || !VALID_TONES.includes(tone)) errors.push('Valid tone is required (professional, friendly, casual, or formal)');
  const goal = typeof data.goal === 'string' ? data.goal.trim().toLowerCase() : '';
  if (!goal || !VALID_GOALS.includes(goal)) errors.push('Valid goal is required');
  return errors;
};

// ─── Shared rules injected into every system prompt ───────────────────────────
const BANNED_PHRASES = `
BANNED PHRASES — never use any of these, ever (2026 outbound KB dead phrases):
- "I noticed that", "I've been analyzing", "I came across", "I was impressed by"
- "I wanted to reach out", "I hope this finds you well", "just reaching out"
- "touching base", "circling back", "bumping this to the top", "just following up"
- "I saw on LinkedIn", "I was doing some research", "I've been looking at your"
- "hope this email finds you", "I'll keep this brief", "quick question"
- "did you see my last email", "I came across your profile", "as a leader in"
- "I'd love to connect", "let me know if you have any questions"
- "looking forward to hearing from you", "innovative solution", "cutting-edge"
- "synergy", "leverage", "any update", "per my last email", "just checking in"
- "wanted to follow up", "I hope this message finds you"
- Any phrase that sounds like you scraped their LinkedIn profile`;

const PERSONALIZATION_RULES = `
PERSONALIZATION RULES:
- Use EXACTLY ONE specific data point about the lead (their role, a recent company signal, their tech stack, or their team size).
- Do NOT list or summarize everything you know about them — pick the single most relevant detail.
- The personalized element should feel like the sender actually knows this space, not like they ran a query on a database.`;

const BREVITY_RULES = `
BREVITY — non-negotiable hard limits:
- Your ENTIRE email body must be under 75 words. Do not exceed this under any circumstances.
- No filler transitions between sentences (no "Additionally,", "Furthermore,", "With that in mind,").
- No paragraph should be more than 2 sentences.`;

const ELITE_OUTBOUND_RULES = `
ELITE OUTBOUND STYLE:
- Sound like a sharp operator who understands revenue motion, not a marketing intern.
- Lead with relevance, not flattery.
- Use plain language a real seller would actually send from their inbox.
- One clear idea per email. No stacking claims.
- CTA should feel easy to answer in 2 seconds.
- Avoid generic asks like "Can I get 15 minutes?" unless it is the clearest possible close.
- Prefer low-friction CTAs such as "worth a look?", "open to seeing it?", "should I send the 2-minute breakdown?", or "worth comparing to your current process?" when appropriate.
- Never sound needy, overexcited, or hype-y.`;

const SIGNOFF_RULES = `
FORMAT:
- Greeting: "Hi {firstName}," — nothing else on that line.
- Sign-off: ONLY the sender's first name on its own line. No "Best,", no "Thanks," — just the name.
- Never output placeholder tokens like [Name], {name}, {{name}}, <name>, [Company], or similar anywhere in the email.
- Generate ONLY the email body. Do NOT include a subject line or any headers.`;

const CLAIMS_RULES = `
CLAIMS & PROOF:
- Do NOT invent results, percentages, customer counts, case studies, benchmark data, funding events, hiring plans, launches, or internal initiatives.
- If a concrete metric or customer proof is not explicitly provided in the input, do not imply one.
- Prefer specific operational outcomes without numbers unless the number is grounded in provided input.
- Never write fake credibility devices like "teams cut ramp time 40%" or "customers reply 3x more" unless that exact proof is provided.`;

// Framework emails output body only — no greeting, no sign-off
const BODY_ONLY_RULES = `
FORMAT:
- Email body ONLY. No greeting. No first name. No sign-off.
- Never output placeholder tokens like [Name], {name}, {{name}}, <name>, [Company], or similar.
- Generate ONLY the email body. Do NOT include a subject line or any headers.`;

// Proximity Rule — active market position. Already there, not offering to go there.
const PROXIMITY_RULE = `
PROXIMITY RULE — NON-NEGOTIABLE:
Write from an active market position always.
Never use: "can build" / "can set up" / "can install" / "can create" / "can help" / "may be able to" / "will help"
Always use: "already working with" / "already live" / "already running" / "already producing" / "already in production"
Weak: "We can help automate your intake calls."
Strong: "We are already running intake workflows for [company type] hitting [result]."`;

const PLACEHOLDER_TOKEN_REGEX = /\[(?:name|company|first\s*name|full\s*name)\]|\{\{\s*(?:name|company|first\s*name|full\s*name)\s*\}\}|\{(?:name|company|first\s*name|full\s*name)\}|<(?:name|company|first\s*name|full\s*name)>/gi;

const cleanGeneratedEmail = (rawEmail: string) => {
  let email = rawEmail.trim();

  if (email.startsWith('```')) {
    email = email.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  }

  email = email.replace(/^Subject:.*\n+/i, '').trim();
  email = email.replace(PLACEHOLDER_TOKEN_REGEX, '').replace(/[ \t]+\n/g, '\n');

  const lines = email.split(/\r?\n/);
  const cleanedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (cleanedLines[cleanedLines.length - 1] !== '') cleanedLines.push('');
      continue;
    }

    const isBarePlaceholder = /^(?:name|company|first\s*name|full\s*name)$/i.test(trimmed);
    if (isBarePlaceholder) continue;

    cleanedLines.push(trimmed);
  }

  return cleanedLines.join('\n').trim();
};

// ─── Template-specific system prompts ─────────────────────────────────────────
const getSystemPrompt = (
  goal: string,
  tone: string,
  use4Sentence: boolean,
  templateDescription: string,
  templateValue: string = ''
): string => {
  const base = `You are a senior B2B sales rep writing short, direct, human outbound emails. Tone: ${tone}.\n`;

  if (use4Sentence) {
    return `${base}
EMAIL FRAMEWORK: The 4-Sentence Framework (observation → pain → solution → CTA).
Purpose of this email: ${templateDescription || goal}

STRUCTURE — exactly 4 sentences in the body (not counting greeting and sign-off):
1. OBSERVATION: One specific, relevant observation about their company or role. Shows you understand their world. NOT a compliment.
2. PAIN: One sentence naming the specific pressure or friction that observation creates for someone in their role.
3. SOLUTION: One sentence explaining what you do and how it directly addresses that pain.
4. CTA: One soft question. "Worth 15 min?", "Open to a quick look?", "Want to see how it works?"
${BREVITY_RULES}${ELITE_OUTBOUND_RULES}${PERSONALIZATION_RULES}${BANNED_PHRASES}
${CLAIMS_RULES}
${SIGNOFF_RULES}`;
  }

  // Signal-specific opener rules — keyed by exact templateValue from the UI
  const SIGNAL_OPENER_RULES: Record<string, string> = {
    'signal_funding':    'SIGNAL: They recently raised funding. Reference the round naturally — new capital means new budget, new pressure to grow fast, new accountability to investors. Open with this context without congratulating them excessively.',
    'signal_new_exec':   'SIGNAL: A new executive just joined their company. New leaders evaluate and replace tools in their first 90 days. Open by acknowledging the new role and the mandate that comes with it.',
    'signal_job_posting': 'SIGNAL: They have an open job posting relevant to your product. The job posting reveals their current pain — reference what the role implies about their process gaps, not the job listing itself.',
    'signal_competitor': 'SIGNAL: They are currently using a competitor product. Do not name the competitor. Instead, reference the category of problem they\'re solving and imply there\'s a faster/better way.',
    'signal_expansion':  'SIGNAL: Their company is expanding — new market, new office, or headcount growth. Growth creates operational friction. Open with the specific pressure that comes from scaling fast.',
  };

  // Direct lookup by templateValue (exact match — no fuzzy string search)
  const signalOpener = SIGNAL_OPENER_RULES[templateValue] || '';

  switch (goal) {
    case 'introduction':
      return `${base}
EMAIL TYPE: Cold Introduction — first-touch, earns a reply, sparks curiosity.
Purpose: ${templateDescription || 'First contact introduction'}
${signalOpener ? `\n${signalOpener}\n` : ''}
STRUCTURE — exactly 3 sentences in the body (not counting greeting and sign-off):
1. ${signalOpener ? 'Use the signal context above as your opening observation — make it feel like you know their world right now, not just their job title.' : 'One specific observation about their company or role that shows you understand their world. NOT a compliment. A relevant business observation.'}
2. One sentence connecting your value prop to that observation — what you collapse, fix, or accelerate for them specifically.
3. Soft CTA as a question: "Worth 15 min to see it?", "Open to a quick look?", "Want to see how?"
${BREVITY_RULES}${ELITE_OUTBOUND_RULES}${PERSONALIZATION_RULES}${BANNED_PHRASES}
${CLAIMS_RULES}
${SIGNOFF_RULES}`;

    case 'follow-up':
      return `${base}
EMAIL TYPE: Follow-up — referencing prior outreach, adding one new angle, direct CTA.
Purpose: ${templateDescription || 'Follow up on previous outreach'}

STRUCTURE — 2-3 sentences:
1. Reference the prior email naturally in one sentence: "Sent you a note last week about X" — do not be apologetic.
2. One new angle or proof point not mentioned in the first email.
3. Direct, casual CTA — assumptive but not pushy: "Still open to a quick look?", "Any thoughts?", "Worth another look?"

TONE: Casual, confident, not apologetic. You're following up because it's relevant, not because you're desperate.
NEVER use: "just following up", "circling back", "bumping this to the top", "wanted to check in"
${BREVITY_RULES}${ELITE_OUTBOUND_RULES}${PERSONALIZATION_RULES}${BANNED_PHRASES}
${CLAIMS_RULES}
${SIGNOFF_RULES}`;

    case 'meeting':
      return `${base}
EMAIL TYPE: Meeting Request — asking for a specific, short call with a clear reason.
Purpose: ${templateDescription || 'Request a quick call or meeting'}

STRUCTURE — 2-3 sentences:
1. One sentence giving context for why this is timely — something specific about their role or situation right now.
2. Direct ask with a time suggestion: "Worth 15 min this week?", "Open to a quick call on Tuesday?"
3. Easy out: "If not the right person, happy to be redirected."

RULE: Be direct about what you want. Do not bury the ask in qualifiers.
${BREVITY_RULES}${ELITE_OUTBOUND_RULES}${PERSONALIZATION_RULES}${BANNED_PHRASES}
${CLAIMS_RULES}
${SIGNOFF_RULES}`;

    case 'demo':
      return `${base}
EMAIL TYPE: Demo Invite — get them to agree to see a 15-minute product demo.
Purpose: ${templateDescription || 'Invite to see a product demo'}

STRUCTURE — 2-3 sentences:
1. Tie directly to their specific pain point — what they're currently dealing with given their role and company stage.
2. What they would see in 15 min — a specific outcome or before/after result, NOT "the product" or "a walkthrough."
3. CTA to book: "Want to see it?", "Worth 15 min?", "Open to a quick demo this week?"

RULE: Make the demo feel valuable, not like a sales pitch. Outcome first, product second.
${BREVITY_RULES}${ELITE_OUTBOUND_RULES}${PERSONALIZATION_RULES}${BANNED_PHRASES}
${CLAIMS_RULES}
${SIGNOFF_RULES}`;

    case 'proposal':
      return `${base}
EMAIL TYPE: Proposal — referencing prior context, presenting a specific outcome, clear next step.
Purpose: ${templateDescription || 'Send a proposal or offer'}

STRUCTURE — 3-4 sentences:
1. Reference prior conversation or context — a specific detail that shows you remember the discussion.
2. Specific outcome or ROI claim — what concretely changes for them if they say yes.
3. What the proposal covers in one clear sentence.
4. Next step — direct and easy: "Want me to send it over?", "Worth a call to walk through it?"

RULE: Outcome-focused, not feature-focused. They care about what changes, not what the product does.
${BREVITY_RULES}${ELITE_OUTBOUND_RULES}${PERSONALIZATION_RULES}${BANNED_PHRASES}
${CLAIMS_RULES}
${SIGNOFF_RULES}`;

    case '4ts':
      return `You are a sharp B2B sales operator writing a cold email using the 4T's framework. Peer-to-peer tone. Two founders at an industry event. You have seen this problem dozens of times.

FRAMEWORK: 4T's (strict order)

1. TRIGGER — One sentence. A specific, publicly observable signal about their company, role, or industry. State it like you already knew. Never "I noticed" or "I saw." Just the observation, stated flatly.
Good: "Looks like [Company] expanded into enterprise last quarter."
Bad: "I noticed you recently started targeting enterprise."

2. THINK — One sharp, pain-based question. What revenue or GTM tension does that trigger create? Never diagnose internals. Never speculate on team size.
Good: "How much pipeline is slipping while everyone's focused on the integration?"
Bad: "That means your team is probably stretched."

3. BRIDGE — Start with "Flagging this because..." or "Sharing this since..."
Then ONE sentence only: mechanism (how you do the work) OR proof point (one company, one result, one timeline). Never both. If a proof point is provided, use it. Otherwise use the mechanism.

4. TALK — End with the CTA provided. Keep it low-friction and answerable in 2 seconds. If no CTA is specified, use: "Worth a look?" or "Open to seeing it?"

LENGTH RULES (HARD):
- Under 75 words total body. Count before outputting. If over, cut the Bridge first and rewrite shorter.
- 3 short paragraphs, one line break between each.

TONE:
- No exclamation points. No em dashes. Short sentences. One idea per sentence. 6th grade reading level.

FORBIDDEN: "Quick call/question" | "I help companies" | "Leverage/Synergy/Optimize" | "Industry-leading/Best-in-class" | "I noticed" | "I saw" | "Just reaching out" | "Happy to"
${BANNED_PHRASES}
${CLAIMS_RULES}
${BODY_ONLY_RULES}`;

    case 'elusive':
      return `You are writing a cold email using the Elusive (Competence Framing) framework. This email NEVER pitches. No proof, no ask for time, no product mention. Just shows you know their world.

FRAMEWORK: 3 moves, strict order.

1. TRIGGER OBSERVATION — One sentence. A specific, observable signal about their company or role. State it flat, like a peer who already knew. No "I noticed" or "I saw."
Good: "Looks like you brought on a new VP of Sales last month."
Bad: "I noticed you recently hired a VP of Sales."

2. DOWNSTREAM PREDICTION — One sentence. An industry-level statement about what typically happens next for companies in this situation. NOT a diagnosis of their company — a category-level observation that shows you know this world.
Format: "Most [company type] going through [trigger type] start feeling [downstream effect] within [timeframe]."
Use the trigger context and company info to form the most relevant prediction.

3. ROUTING QUESTION — End with exactly: "Who would be the right person to connect with on this?"

LENGTH RULES (HARD):
- Under 60 words total. Count before outputting. If over, trim the prediction sentence first.
- 3 lines with a line break between each.

TONE:
- No exclamation points, no em dashes, no colons in openers. Flat, informed, peer-level.
- Never diagnose their internals. Never speculate on team, revenue, or ops.

FORBIDDEN: "Quick call/question" | "I help companies" | "I noticed" | "I saw" | Any pitch or product mention | "Leverage/Synergy" | "Industry-leading"
${BANNED_PHRASES}
${CLAIMS_RULES}
${BODY_ONLY_RULES}
End with exactly: Who would be the right person to connect with on this?`;

    case 'proximity':
      return `You are writing a cold email using the Proximity framework — 4T's structure with active market positioning. Peer-to-peer tone. You have been inside this space long enough to know what happens next. You write like someone already close to their outcome.
${PROXIMITY_RULE}

FRAMEWORK: 4T's with Proximity (strict order)

1. TRIGGER — One sentence. Specific, observable signal. State it like you already knew. No "I noticed." If no clear trigger, state the company's most likely active situation as an observation.

2. THINK — One sharp, pain-based question tied to the trigger. Never diagnose internals.
Good: "How much is slipping while everyone is focused on [trigger]?"
Bad: "That means your team is probably stretched."

3. BRIDGE — "Flagging this because..." or "Sharing this since..."
ONE sentence: proof if provided (one company, result, timeline) OR mechanism in active tense. Never both.
Active tense only — "already running" not "can help."

4. TALK — Low-friction CTA. Answerable in 2 seconds. If no CTA specified, use: "Worth a look?" or "Open to seeing it?"

LENGTH RULES (HARD):
- Under 75 words total. Count before outputting. If over, cut Bridge and rewrite shorter.
- 3 short paragraphs, line breaks between.

TONE:
- No exclamation points, no em dashes, no colons in openers. Short sentences. One idea per sentence.

FORBIDDEN: "Quick call/question" | "I help companies" | "I noticed" | "Leverage/Synergy/Optimize" | "Industry-leading" | "can build" | "can help" | "can set up"
${BANNED_PHRASES}
${CLAIMS_RULES}
${BODY_ONLY_RULES}`;

    case '4ps_followup':
      return `You are writing a follow-up email using the 4P's framework. The prospect saw the first email and didn't reply. REFRAME — do not re-pitch. New frame, new angle.

OPENING LINE (use exactly):
I reached out the other day but likely didn't do the best job explaining how we help.

FRAMEWORK: 4P's (strict order)

1. PROBLEM — One clear revenue or operational gap anchored to their situation. No speculating on internals.

2. PROMISE — The mechanism in plain language. What happens, in what order, how fast. Tangible enough the prospect can picture the work.

3. PROOF — One sentence max. One specific client, result, and timeline if provided. Skip entirely if not provided — never force or invent.

4. PROPOSAL — Soft CTA. Different wording than the first email. Low-friction and answerable in 2 seconds.

LENGTH RULES (HARD):
- Under 120 words total. Count before outputting. If over, cut Proof first, then trim Promise.
- Line breaks between paragraphs.

TONE:
- No em dashes, no exclamation points. Peer-to-peer, direct, helpful.
- Do not repeat angles from the first email — new frame only.

FORBIDDEN: "Just following up" | "Bumping this" | "Circling back" | "Quick call" | "Leverage/Synergy" | "Happy to"
${BANNED_PHRASES}
${CLAIMS_RULES}
${BODY_ONLY_RULES}
Start with exactly: I reached out the other day but likely didn't do the best job explaining how we help.`;

    case '4ps_elusive_followup':
      return `You are writing a follow-up email for the Elusive (Competence Framing) sequence. Email 1 asked a routing question — this email reveals the reason. REFRAME — do not re-pitch.

OPENING LINE (use exactly):
Reason I ask about this is...

CLOSING LINE (use exactly):
Am I barking up the wrong tree?

FRAMEWORK: Modified 4P's (strict order)

1. REASON / PROBLEM — Complete the opening line by revealing why you sent Email 1. Connect to the downstream pain from the prospect's situation. One to two sentences. Anchor to revenue or operational output — not process.

2. PROMISE — The mechanism in plain language. What happens, in what order, how fast. Tangible enough the prospect can picture it in their operation.

3. PROOF — One sentence max. One client, one result, one timeline if provided. Skip entirely if not provided — never force.

4. PROPOSAL — Close with exactly: Am I barking up the wrong tree?

LENGTH RULES (HARD):
- Under 120 words total. Count before outputting. If over, cut Proof first, then trim Promise.
- Line breaks between paragraphs.

TONE:
- No em dashes, no exclamation points. Peer-to-peer, direct, unhurried.
- No repeating Email 1 angles — new frame only.

FORBIDDEN: "Just following up" | "Bumping this" | "Circling back" | "Quick call" | "Leverage/Synergy"
${BANNED_PHRASES}
${CLAIMS_RULES}
${BODY_ONLY_RULES}
Start with exactly: Reason I ask about this is...
End with exactly: Am I barking up the wrong tree?`;

    default:
      return `${base}
EMAIL TYPE: ${templateDescription || goal}

STRUCTURE — 3 sentences:
1. One specific, relevant observation about this person or their company.
2. One sentence connecting your value prop to that observation.
3. Soft CTA as a question.
${BREVITY_RULES}${ELITE_OUTBOUND_RULES}${PERSONALIZATION_RULES}${BANNED_PHRASES}
${CLAIMS_RULES}
${SIGNOFF_RULES}`;
  }
};

// ─── Subject line system prompt ───────────────────────────────────────────────
const SUBJECT_SYSTEM_PROMPT = `You are an expert B2B cold email copywriter writing subject lines that get opened.

RULES — non-negotiable:
- Maximum 6 words. Hard ceiling. Count every word.
- Lowercase preferred, except proper nouns and abbreviations.
- Must reference something specific to this lead or their company — not generic.
- Direct and specific wins. No metaphors, no cleverness, no clickbait.
- NEVER use: "Quick question", "Checking in", "Following up", "Let's connect", "Opportunity", "Partnership"
- Good examples: "quick q about northline's outbound" / "re: founder-led sales at stackline" / "outbound stack question" / "sdr process at signalfox?"
- CRITICAL: Every generation must produce a COMPLETELY DIFFERENT subject line. Never reuse the same structure or angle twice.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const requestData = await req.json();
    const lead               = requestData.lead;
    const tone               = typeof requestData.tone               === 'string' ? requestData.tone.trim().toLowerCase()               : '';
    const goal               = typeof requestData.goal               === 'string' ? requestData.goal.trim().toLowerCase()               : '';
    const templateGoal       = typeof requestData.templateGoal       === 'string' ? requestData.templateGoal.trim().toLowerCase()       : goal;
    const templateDescription = typeof requestData.templateDescription === 'string' ? requestData.templateDescription.trim()            : '';
    const subjectLine        = typeof requestData.subjectLine        === 'string' ? requestData.subjectLine.trim()                      : '';
    const triggerContext     = typeof requestData.triggerContext      === 'string' ? requestData.triggerContext.trim()                  : '';
    const openerWord         = typeof requestData.openerWord         === 'string' ? requestData.openerWord.trim().toLowerCase()         : '';
    const socialProof        = typeof requestData.socialProof        === 'string' ? requestData.socialProof.trim()                     : '';
    const businessDescription = typeof requestData.businessDescription === 'string' ? requestData.businessDescription.trim().slice(0, 500) : '';
    const variantNum         = typeof requestData.variantNum         === 'number'  ? requestData.variantNum                            : 0;
    const use4SentenceFramework = requestData.use4SentenceFramework === true;
    const templateValue        = typeof requestData.templateValue        === 'string' ? requestData.templateValue.trim()                   : '';
    const customInstruction   = typeof requestData.customInstruction   === 'string' ? requestData.customInstruction.slice(0, 8000)         : '';

    const validationErrors = validateEmailInputs({ lead, tone, goal });
    if (validationErrors.length > 0) {
      return new Response(JSON.stringify({ error: validationErrors.join(', ') }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: leadData, error: leadError } = await supabaseClient
      .from('leads').select('id, user_id').eq('id', lead.id).single();
    if (leadError || !leadData || leadData.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Lead not found or unauthorized' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // ─── Sanitize lead fields ──────────────────────────────────────────────────
    const sanitizedContactName     = sanitizeString(lead.contact_name || 'there', 100);
    const firstName                = sanitizedContactName.split(' ')[0];
    const sanitizedCompanyName     = sanitizeString(lead.company_name || 'your company', 100);
    const sanitizedIndustry        = lead.industry        ? sanitizeString(lead.industry, 100)        : null;
    const sanitizedCompanySize     = lead.company_size    ? sanitizeString(lead.company_size, 50)     : null;
    const sanitizedJobTitle        = lead.job_title       ? sanitizeString(lead.job_title, 100)       : null;
    const sanitizedDepartment      = lead.department      ? sanitizeString(lead.department, 100)      : null;
    const sanitizedSeniority       = lead.seniority       ? sanitizeString(lead.seniority, 50)        : null;
    const sanitizedTechnologies    = lead.technologies && lead.technologies.length > 0
      ? lead.technologies.slice(0, 8).join(', ') : null;
    const sanitizedCompanyDescription = lead.company_description
      ? sanitizeString(lead.company_description, 400) : null;
    const sanitizedEmployeeCount   = lead.employee_count  ? sanitizeString(lead.employee_count, 50)  : null;
    const sanitizedNotes           = lead.notes           ? sanitizeString(lead.notes, 300)           : null;

    // ─── Lead context block ────────────────────────────────────────────────────
    const buildLeadContext = (includeEnrichment = true) => {
      const lines = [
        `- Name: ${sanitizedContactName} (use first name only: "${firstName}")`,
        `- Company: ${sanitizedCompanyName}`,
      ];
      if (sanitizedJobTitle)     lines.push(`- Job Title: ${sanitizedJobTitle}`);
      if (sanitizedDepartment)   lines.push(`- Department: ${sanitizedDepartment}`);
      if (sanitizedSeniority)    lines.push(`- Seniority: ${sanitizedSeniority}`);
      if (sanitizedIndustry)     lines.push(`- Industry: ${sanitizedIndustry}`);
      if (sanitizedCompanySize)  lines.push(`- Company Size: ${sanitizedCompanySize}`);
      if (sanitizedEmployeeCount) lines.push(`- Employee Count: ${sanitizedEmployeeCount}`);
      if (sanitizedTechnologies) lines.push(`- Technologies: ${sanitizedTechnologies}`);
      if (includeEnrichment && sanitizedCompanyDescription)
        lines.push(`- Company Description: ${sanitizedCompanyDescription}`);
      if (includeEnrichment && sanitizedNotes)
        lines.push(`- Notes / Context: ${sanitizedNotes}`);
      if (lead.icp_score)        lines.push(`- ICP Match Score: ${lead.icp_score}/100`);
      return lines.join('\n');
    };

    let systemPrompt: string;
    let userPrompt: string;

    // ─── Branch by goal ────────────────────────────────────────────────────────
    if (goal === 'subject_only') {
      systemPrompt = SUBJECT_SYSTEM_PROMPT;

      const emailPurpose = templateDescription || templateGoal;
      userPrompt = `Generate one subject line for this lead. Email type: ${emailPurpose}.

IMPORTANT: This is generation #${Date.now() % 1000}. Produce a completely unique subject line — different structure, angle, and wording from any previous generation.

Lead:
${buildLeadContext(false)}
${triggerContext ? `- Trigger/Context: ${triggerContext}` : ''}
${businessDescription ? `\nSender's product: ${businessDescription}` : ''}

Return ONLY the subject line. No quotes, no "Subject:" prefix. Max 6 words.`;

    } else if (goal === 'trigger_context') {
      systemPrompt = `You are an expert B2B sales researcher. Generate a personalized trigger/context opener for cold emails.

RULES:
- Start with one of these 7 power words: You, Saw, How, Spoke, Noticed, Referred, Remember
- Base it ONLY on the lead data provided — do NOT invent events (funding rounds, launches, hirings) unless explicitly stated in the data.
- Keep it under 50 words.
- Sound like someone who knows the space, not someone who read their LinkedIn profile.
- CRITICAL: Every generation must use a different power word, angle, and structure.
${BANNED_PHRASES}
${CLAIMS_RULES}`;

      userPrompt = `Generate a personalized trigger/context opener for this lead.

IMPORTANT: Generation #${Date.now() % 1000} — use a completely different angle and power word from any previous attempt.

Lead:
${buildLeadContext(true)}
${openerWord && VALID_OPENERS.includes(openerWord) ? `\nPreferred Opening Word: "${openerWord.charAt(0).toUpperCase() + openerWord.slice(1)}"` : ''}
${businessDescription ? `\nSender's product: ${businessDescription}` : ''}

Return ONLY the trigger opener sentence. No quotes, no explanations.`;

    } else if (goal === 'social_proof') {
      systemPrompt = `You are an expert B2B sales copywriter generating social proof text for cold emails.

RULES:
- Do NOT fabricate company names, customer names, or specific metrics.
- If no real social proof is provided, use honest generic phrasing like "teams in [industry]" or "companies like yours."
- Keep under 40 words.
- Sound credible and honest, not hype-y.`;

      userPrompt = `Generate social proof text relevant to this lead.

Lead:
${buildLeadContext(false)}
${businessDescription ? `\nSender's product: ${businessDescription}` : ''}

Return ONLY the social proof text. No quotes, no explanations.`;

    } else if (goal === 'custom' && customInstruction) {
      // Precision-editor mode used by EmailQualityChecker "Fix this" buttons.
      // The client supplies a full instruction including the current email body and a surgical fix task.
      // We pass it through directly so the model edits in place rather than regenerating.
      systemPrompt = `You are a precision editor for cold outbound emails. You make the smallest possible change to address the specified issue while preserving the rest of the email verbatim. Return ONLY the corrected email body.`;
      userPrompt = customInstruction;

    } else if (goal === 'custom' && subjectLine) {
      const effectiveGoal = templateGoal || 'introduction';
      systemPrompt = getSystemPrompt(effectiveGoal, tone, use4SentenceFramework, templateDescription, templateValue);

      userPrompt = `Write the email body that matches this subject line: "${subjectLine}"

Lead data (choose ONE data point to personalize with — do not use all of it):
${buildLeadContext(true)}
${triggerContext ? `\nContext/opener to use: ${triggerContext}` : ''}
${openerWord && VALID_OPENERS.includes(openerWord) ? `\nPreferred opening word: "${openerWord.charAt(0).toUpperCase() + openerWord.slice(1)}"` : ''}
${businessDescription ? `\nWhat we do: ${businessDescription}` : ''}

Write the email body. Start with "Hi ${firstName}," and end with just the sender's name on its own line.`;

    } else if (FRAMEWORK_GOALS.has(goal)) {
      // 3-prompt pipeline framework goals — body only, no greeting or sign-off
      systemPrompt = getSystemPrompt(goal, tone, false, templateDescription, templateValue);

      const is4psFollowup = goal === '4ps_followup' || goal === '4ps_elusive_followup';
      const wordLimitNote = goal === 'elusive' ? 60 : goal === '4ps_followup' || goal === '4ps_elusive_followup' ? 120 : 75;

      userPrompt = `Write a cold email using the ${goal} framework.

PROSPECT:
${buildLeadContext(true)}
${triggerContext ? (is4psFollowup ? `\nFirst email sent (reframe from a DIFFERENT angle — do not repeat):\n${triggerContext}` : `\nTrigger / Signal to use: ${triggerContext}`) : ''}
${businessDescription ? `\nWhat we do${is4psFollowup ? ' (use for Promise)' : ' (use for Bridge if no proof available)'}: ${businessDescription}` : ''}
${socialProof ? `\nProof point (${is4psFollowup ? 'use for Proof — different angle from Email 1 if possible' : 'use for Bridge'}): ${socialProof}` : ''}

Count your words. If over ${wordLimitNote}, ${goal === '4ps_followup' || goal === '4ps_elusive_followup' ? 'cut Proof first then trim Promise' : 'cut the Bridge and rewrite shorter'}. Output body only — no greeting, no sign-off.`;

    } else {
      // Standard generation
      systemPrompt = getSystemPrompt(goal, tone, use4SentenceFramework, templateDescription, templateValue);

      userPrompt = `Write the email body for this lead.

Lead data (choose ONE data point to personalize with — do not use all of it):
${buildLeadContext(true)}
${triggerContext ? `\nContext/opener to use as your first sentence: ${triggerContext}` : ''}
${openerWord && VALID_OPENERS.includes(openerWord) ? `\nPreferred opening word: "${openerWord.charAt(0).toUpperCase() + openerWord.slice(1)}"` : ''}
${businessDescription ? `\nWhat we do: ${businessDescription}` : ''}

Write the email body. Start with "Hi ${firstName}," and end with just the sender's name on its own line.`;
    }

    const isPrecisionEdit = goal === 'custom' && !!customInstruction;
    const isFrameworkGoal = FRAMEWORK_GOALS.has(goal);
    // Framework emails use temp 0.5 (as per 3-prompt pipeline spec); precision edits use 0.3
    const temperature = isPrecisionEdit ? 0.3 : (isFrameworkGoal ? (variantNum > 0 ? 0.7 : 0.5) : (variantNum > 0 ? 1.0 : 0.85));

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
          {
            role: "user",
            content: userPrompt + (variantNum > 0
              ? `\n\n[Variant #${variantNum} — use a completely different angle, opener, and phrasing. Same structure, different execution.]`
              : ''),
          },
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
    let email = data.choices[0].message.content.trim();
    email = cleanGeneratedEmail(email);

    return new Response(JSON.stringify({ email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Error in generate-email function:", error);
    return new Response(JSON.stringify({ error: 'Failed to generate email' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
