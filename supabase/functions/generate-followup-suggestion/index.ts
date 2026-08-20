// Follow-up suggestion, offered after a send in Outreach Studio and written
// straight into email_drafts when auto-queue is on.
//
// This function used to carry its own writing rules: a one-line system prompt,
// nine hand-typed banned phrases out of the shared list's fifty-three, no GTM
// skills, and no quality scoring. It was the fourth copy of the writing rules
// and the one the consolidation missed, because it lives in its own function
// rather than in generate-email's prompt constants.
//
// It also handed the model finished sentences to copy: the opener was given as
// a complete clause to fill one variable into, and the close was a menu of
// three verbatim questions. Models take an example sentence as the sentence to
// use, so every follow-up this produced opened with that exact clause and
// closed with one of those three questions. That is not a model being lazy; it
// is the prompt writing the email.
//
// The beats below say what each line must ACHIEVE and never how it should read.
// Those old strings are deliberately not reproduced anywhere in this file —
// src/lib/followup-guardrails.test.ts asserts their absence, so pasting one
// back in as an "example" fails the build.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { composeSkillContext, skillNamesUsed } from "../_shared/email-skills.ts";
import { bannedPhrasesBlock, findPlaceholders, hasPlaceholder } from "../_shared/email-rules.ts";
import { isWeak, rubricFeedback, scoreEmail } from "../_shared/email-quality.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOAL = "follow-up";

interface Suggestion {
  suggestedSubject: string;
  suggestedBody: string;
  suggestedDays: number;
  triggerContext: string;
}

/** Strip code fences and parse, or return null. */
function parseSuggestion(content: string): Suggestion | null {
  try {
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed?.suggestedSubject || !parsed?.suggestedBody) return null;
    return {
      suggestedSubject: String(parsed.suggestedSubject).trim(),
      suggestedBody: String(parsed.suggestedBody).trim(),
      suggestedDays: Number(parsed.suggestedDays) || 3,
      triggerContext: String(parsed.triggerContext ?? "").trim(),
    };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth required — prevents anonymous abuse of LOVABLE_API_KEY credits.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const {
      leadName, companyName, originalSubject, leadEmail, jobTitle, industry,
      companyDescription, technologies, senderName, originalBody,
    } = await req.json();

    if (!leadName || !companyName) {
      throw new Error("Missing required fields: leadName and companyName");
    }

    const leadFirstName = String(leadName).trim().split(/\s+/)[0];
    // The sender's name, never the lead's. The fallback drafts below used to
    // sign off with leadName, so a follow-up to Justin was signed "Justin".
    const senderFirstName = String(senderName ?? "").trim().split(/\s+/)[0];

    const leadContext = [
      `- Lead name: ${leadName}`,
      `- Company: ${companyName}`,
      `- Original email subject: ${originalSubject || "Introduction email"}`,
      jobTitle ? `- Job Title: ${jobTitle}` : null,
      industry ? `- Industry: ${industry}` : null,
      companyDescription ? `- Company Description: ${companyDescription}` : null,
      technologies?.length ? `- Technologies: ${technologies.slice(0, 5).join(", ")}` : null,
      // Without the first email, "do not repeat what you already said" is an
      // instruction the model cannot follow, so it rephrases touch 1 instead.
      originalBody ? `\nTHE EMAIL THEY ALREADY IGNORED:\n${String(originalBody).slice(0, 1200)}` : null,
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are a senior B2B operator writing one follow-up email. Respond with valid JSON only, no markdown.

RULES (non-negotiable):
- Body under 60 words. 2-3 sentences. 8th-grade reading level.
- No em-dashes, no emojis, no bullets, no markdown, no links, no exclamation points.
- Exactly ONE low-friction CTA, in question form.
- Sign-off: the sender's first name alone on its own line. Never "Best," or "Thanks,".
- Their world, not yours: "you"/"your" must outnumber "we"/"our"/"I".
- Use EXACTLY ONE specific fact from the lead context. Never invent a fact,
  company, metric or customer name that is not in it.
- No placeholders. Every token must be filled in.

EVERY CLAUSE MUST SURVIVE "SO WHAT":
A benefit noun with no mechanism attached is filler, and filler is what makes
these read as mass mail. "Drives efficiency", "clear ROI", "predictable
pipeline", "helping teams like yours", "without manual work" all assert an
outcome while saying nothing about how it happens or why it applies to THIS
company. If you write a benefit, the same sentence must carry the specific
thing that produces it. If you cannot name that thing, cut the clause and say
something true and concrete instead. A shorter honest email beats a padded one.
${bannedPhrasesBlock()}

WHAT THIS EMAIL IS:
It is the second contact with someone who did not answer the first. It must
earn a reply on its own terms, not repeat the first email in new words.
${composeSkillContext({ goal: GOAL })}`;

    const prompt = `Write one follow-up email to this prospect. Return JSON only.

CONTEXT:
${leadContext}

SENDER first name (use verbatim in the sign-off): ${senderFirstName || "the sender"}

THE BEATS — what each line must ACHIEVE. Choose your own wording for all of
them; any phrasing shown anywhere in this prompt is a description of a job,
never a sentence to reuse:
1. Establish continuity with the earlier email without narrating the fact that
   you are following up, and without apology or guilt.
2. Add ONE angle that was NOT in the first email — a different consequence, a
   different part of their operation, or a concrete observation about their
   business. Rewording the first email's point is the failure to avoid.
3. Close on a single question that costs them almost nothing to answer.

ALSO RETURN:
- A subject line: 2-5 words, under 40 characters, lowercase, reads like a
  colleague wrote it. No "re:" fakery, no numbers, no percentages.
- suggestedDays: 3 to 5.
- triggerContext: one short line for the CRM.

Respond in this EXACT JSON format:
{
  "suggestedSubject": "...",
  "suggestedBody": "...",
  "suggestedDays": 3,
  "triggerContext": "..."
}`;

    console.log(`[followup] skills: ${skillNamesUsed({ goal: GOAL }).join(", ")}`);

    const callModel = async (userPrompt: string): Promise<string | null> => {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) throw Object.assign(new Error("rate_limit"), { status: 429 });
        if (response.status === 402) throw Object.assign(new Error("no_credits"), { status: 402 });
        console.error("AI gateway error:", response.status, await response.text());
        throw new Error("Failed to generate follow-up suggestion");
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? null;
    };

    const content = await callModel(prompt);
    if (!content) throw new Error("No content in AI response");

    let suggestion = parseSuggestion(content);

    // Same gate the AI SDR runs before it sends: score the draft, and give one
    // rewrite informed by the rubric's own objections. A suggestion the user
    // has to fix by hand is barely worth offering, and with auto-queue on it
    // goes to email_drafts unread.
    //
    // A null score is "unscored", not "bad" — the rubric is plan-gated to
    // growth and above, so it must never block a starter user's draft.
    if (suggestion) {
      const rubric = await scoreEmail(supabaseUrl, authHeader, anonKey, {
        subject: suggestion.suggestedSubject,
        body: suggestion.suggestedBody,
      });
      if (isWeak(rubric)) {
        const retry = await callModel(prompt + rubricFeedback(rubric!)).catch(() => null);
        const retrySuggestion = retry ? parseSuggestion(retry) : null;
        if (retrySuggestion) {
          const retryRubric = await scoreEmail(supabaseUrl, authHeader, anonKey, {
            subject: retrySuggestion.suggestedSubject,
            body: retrySuggestion.suggestedBody,
          });
          // Keep whichever attempt actually scored better; a rewrite is not
          // automatically an improvement.
          if ((retryRubric?.overall ?? 0) > (rubric?.overall ?? 0)) suggestion = retrySuggestion;
        }
      }
    }

    // An unfilled merge token must never reach a prospect, and with auto-queue
    // on nobody reads this before it lands in drafts. Unlike a weak score this
    // is not a judgement call, so it fails rather than degrading.
    if (suggestion && (hasPlaceholder(suggestion.suggestedSubject) || hasPlaceholder(suggestion.suggestedBody))) {
      const found = [...findPlaceholders(suggestion.suggestedSubject), ...findPlaceholders(suggestion.suggestedBody)];
      console.error("[followup] draft had unfilled placeholders:", found.join(", "));
      return new Response(
        JSON.stringify({ error: "Could not write a complete follow-up for this lead. Try again, or write it yourself.", error_code: "placeholder" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!suggestion) {
      // No canned body here on purpose. The old fallback shipped a fixed
      // sentence signed with the LEAD's first name, which is worse than
      // admitting the generation failed.
      console.error("[followup] unparseable model output:", content.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "Could not write a follow-up for this lead right now. Please try again.", error_code: "unparseable" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("Error in generate-followup-suggestion:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
