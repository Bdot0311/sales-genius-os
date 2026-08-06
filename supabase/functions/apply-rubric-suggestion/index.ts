import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Applying a rubric suggestion is part of the Growth+ rubric feature set.
const GROWTH_PLUS = new Set(["growth", "pro", "agency"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Backstop the copy style even if the model drifts.
function clean(s: string): string {
  return s.replace(/[—–]/g, ", ").replace(/!+/g, ".").replace(/\s+/g, " ").trim().replace(/^["'`]+|["'`]+$/g, "");
}

const SYSTEM = `You rewrite one small snippet of a cold outbound email so it satisfies a specific rubric suggestion.

Rules:
- rewrite only the snippet you are given, keeping it roughly the same length
- keep the writer's voice, keep it plain and direct, lowercase-first is fine if the original is
- no em-dashes, no exclamation points, no hype words, no invented facts about the prospect
- do not add greetings, sign-offs, links, or extra sentences beyond what the snippet covered
- return only the replacement text, with no quotes, no labels, and no explanation`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) return json({ error: "Invalid user token" }, 401);

    const { data: adminRole } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (adminRole?.role !== "admin") {
      const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
      if (!GROWTH_PLUS.has((sub?.plan || "free").toLowerCase())) {
        return json({ error: "applying suggestions is available on growth and above.", error_code: "upgrade_required" }, 403);
      }
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const snippet = typeof body.snippet === "string" ? body.snippet.trim() : "";
    const suggestion = typeof body.suggestion === "string" ? body.suggestion.trim() : "";
    const dimension = typeof body.dimension === "string" ? body.dimension : "";
    const emailSubject = typeof body.subject === "string" ? body.subject : "";
    const emailBody = typeof body.body === "string" ? body.body : "";
    if (!snippet || !suggestion) return json({ error: "snippet and suggestion are required", error_code: "invalid_input" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "applying suggestions is temporarily unavailable.", error_code: "not_configured" }, 200);

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: `Full email for context.\nSubject: ${emailSubject}\nBody:\n${emailBody}\n\nSnippet to rewrite:\n${snippet}\n\nRubric dimension: ${dimension}\nSuggestion to satisfy: ${suggestion}\n\nReplacement snippet:`,
          },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) return json({ error: "too many requests right now. try again shortly.", error_code: "rate_limit" }, 429);
      return json({ error: "could not apply this suggestion right now.", error_code: "ai_failed" }, 200);
    }

    const raw = (await res.json()).choices?.[0]?.message?.content || "";
    const replacement = clean(String(raw));
    if (!replacement) return json({ error: "could not apply this suggestion right now.", error_code: "empty" }, 200);

    return json({ replacement });
  } catch (e) {
    console.error("[apply-rubric-suggestion] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
