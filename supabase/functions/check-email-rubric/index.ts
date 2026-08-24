import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { RUBRIC_SYSTEM_PROMPT, rubricUserPayload } from "./prompt.ts";
import { aiFetch } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Full R.E.P.L.Y. rubric is a Growth+ feature; Free/Starter get mechanical checks client-side.
const GROWTH_PLUS = new Set(["growth", "pro", "agency"]);
const DIMS = ["relevance", "empathy", "payoff", "low_friction_ask", "you_focused"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Backstop the copy style even if the model drifts.
function clean(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(/[—–]/g, ", ").replace(/!+/g, ".").replace(/\s+/g, " ").trim().replace(/^[A-Z]/, (c) => c.toLowerCase());
}

function parseJson(content: string): any {
  let s = content.trim();
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  else { const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a !== -1 && b > a) s = s.slice(a, b + 1); }
  return JSON.parse(s);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Invalid user token" }, 401);

    // Tier gating (server-side): full rubric is Growth and above. Admins bypass.
    const { data: adminRole } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (adminRole?.role !== "admin") {
      const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
      if (!GROWTH_PLUS.has((sub?.plan || "free").toLowerCase())) {
        return json({ error: "the full rubric is available on growth and above.", error_code: "upgrade_required" }, 403);
      }
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const subject = typeof body.subject === "string" ? body.subject : "";
    const emailBody = typeof body.body === "string" ? body.body : "";
    if (!emailBody.trim()) return json({ error: "email body is required", error_code: "invalid_input" }, 400);

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "rubric is temporarily unavailable.", error_code: "not_configured" }, 200);

    const res = await aiFetch("check-email-rubric", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        messages: [
          { role: "system", content: RUBRIC_SYSTEM_PROMPT },
          { role: "user", content: rubricUserPayload(subject, emailBody) },
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) return json({ error: "too many requests right now. try again shortly.", error_code: "rate_limit" }, 429);
      return json({ error: "could not score this email right now.", error_code: "ai_failed" }, 200);
    }

    // Parse strictly, fail closed: on malformed output return an error, never fabricate a score.
    let parsed: any;
    try {
      parsed = parseJson((await res.json()).choices?.[0]?.message?.content || "");
    } catch {
      return json({ error: "could not score this email right now.", error_code: "unparseable" }, 200);
    }

    const dimensions: Record<string, { score: number; justification: string }> = {};
    for (const d of DIMS) {
      const raw = parsed?.dimensions?.[d] || {};
      const score = Math.max(0, Math.min(5, Math.round(Number(raw.score) || 0)));
      dimensions[d] = { score, justification: clean(raw.justification) };
    }
    const suggestions = Array.isArray(parsed?.suggestions)
      ? parsed.suggestions
          .filter((s: any) => s && typeof s.snippet === "string")
          .slice(0, 5)
          .map((s: any) => ({
            snippet: String(s.snippet).slice(0, 300),
            dimension: DIMS.includes(s.dimension) ? s.dimension : "relevance",
            suggestion: clean(s.suggestion),
          }))
      : [];

    const weakest = DIMS.reduce((lo, d) => (dimensions[d].score < dimensions[lo].score ? d : lo), DIMS[0]);

    return json({ dimensions, suggestions, weakest });
  } catch (e) {
    console.error("[check-email-rubric] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
