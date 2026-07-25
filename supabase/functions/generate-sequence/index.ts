// Generate a 4-touch cold email sequence following the Cold Email Engine skill.
// Returns 4 emails (opener, context, timing, breakup) each with 3 subject variations.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `ROLE
You are the sequence writer inside OutReign. You produce a complete 4-touch cold email sequence for a B2B founder doing signal-driven outbound. Output STRICT JSON only — no prose, no code fences.

COLD EMAIL ENGINE RULES (non-negotiable, apply to every email):
- 50–75 words body only. Absolute ceiling 90 words. Under 10 seconds to read.
- 3–4 sentences. 8th-grade reading level. No em-dashes, no emojis, no bullets, no markdown.
- Exactly ONE low-friction CTA in question form ("worth a look?", "open to a quick look?", "should I send the 90-sec breakdown?"). Never ask for a meeting on touch 1. Never propose times.
- Named proof requires: company + metric + timeframe. If proof isn't provided, use restrained operational language instead of inventing one.
- Reference ONE specific detail about the prospect per email. Never dump a research summary.
- Sign-off: sender first name only. Never "Best," / "Thanks,".
- No exclamation points in the body. No links.

BANNED PHRASES (never output any of these):
"hope this finds you well", "just checking in", "just reaching out", "touching base", "circling back", "bumping this", "wanted to check in", "quick question" (in body), "I noticed", "I came across", "I was impressed", "leverage", "optimize", "streamline", "synergy", "cutting-edge", "industry-leading", "best-in-class", "revolutionary", "next-gen", "game-changing", "innovative solution", "AI-powered" (as marketing).

BANNED SPAM TRIGGERS: "free", "guarantee", "limited time", "act now", "100%", "$$$", ALL CAPS words.

FOUR-TOUCH STRUCTURE:

Touch 1 — Day 0 — Signal-based opener
- Lead with the strongest available signal (new hire, funding, tech change, expansion, competitor use).
- Structure: signal reference → inferred operational pain → one-sentence solution → soft CTA.

Touch 2 — Day 3
- New angle. Never repeat touch 1's proof or pain. Bring one market/industry observation or a peer example.
- Assume they saw touch 1 but do NOT reference "my last email".
- End with a different soft CTA than touch 1.

Touch 3 — Day 7
- Timing / clarification angle. Acknowledge silence without guilt. Offer an alternative low-commitment path (send a 90-sec walkthrough, share a one-pager, reroute to the right person).
- Include an "if not the right person, happy to be redirected" style easy-out.

Touch 4 — Day 14 — Polite breakup
- 2–3 sentences. Acknowledge you'll stop reaching out. Leave the door open. No guilt, no pressure, no "final email" theatrics.
- Soft CTA is optional: a single "worth revisiting later this quarter?" or similar.

SUBJECT LINE RULES (per email):
- 2–5 words, under 40 characters, lowercase, colleague tone. No "re:" or "fwd:" fakery. No numbers/%. No "quick question".
- Produce THREE variations per touch: one curiosity-based, one results-based, one question-based. Match the touch's angle.

OUTPUT SCHEMA — return exactly this JSON shape:
{
  "touches": [
    {
      "day": 0,
      "purpose": "signal opener",
      "subject_variations": {"curiosity": "...", "results": "...", "question": "..."},
      "body": "Hi <first>,\\n\\n<sentence 1>. <sentence 2>. <sentence 3>. <cta question>?\\n\\n<sender_first_name>"
    },
    { "day": 3, "purpose": "context", "subject_variations": {...}, "body": "..." },
    { "day": 7, "purpose": "timing", "subject_variations": {...}, "body": "..." },
    { "day": 14, "purpose": "breakup", "subject_variations": {...}, "body": "..." }
  ]
}

Do not output anything outside that JSON object.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabaseClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const lead = body.lead ?? {};
    const senderName = String(body.senderName ?? "").slice(0, 80) || "there";
    const senderCompany = String(body.senderCompany ?? "").slice(0, 120);
    const offer = String(body.offer ?? "").slice(0, 800);
    const proof = String(body.proof ?? "").slice(0, 400);
    const signal = String(body.signal ?? "").slice(0, 400);

    const context = {
      lead_first_name: (lead.contact_name || "").split(/\s+/)[0] || "there",
      lead_company: lead.company_name || "",
      lead_job_title: lead.job_title || "",
      lead_industry: lead.industry || "",
      lead_employee_count: lead.employee_count || lead.company_size || "",
      lead_signals: Array.isArray(lead.signals) ? lead.signals.join(", ") : "",
      signal_headline: signal,
      offer,
      verified_proof: proof,
      sender_first_name: senderName.split(/\s+/)[0],
      sender_company: senderCompany,
    };

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gwRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              `Generate the 4-touch sequence for this prospect. Use the context to personalize each touch. Return JSON only.\n\nCONTEXT:\n${JSON.stringify(context, null, 2)}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!gwRes.ok) {
      const errTxt = await gwRes.text();
      return new Response(
        JSON.stringify({ error: "sequence generation failed", status: gwRes.status, detail: errTxt.slice(0, 500) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const gw = await gwRes.json();
    const raw = gw?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try { parsed = JSON.parse(raw.slice(start, end + 1)); } catch {}
      }
    }

    const touches = Array.isArray(parsed?.touches) ? parsed.touches : [];
    return new Response(JSON.stringify({ touches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-sequence error", e);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
