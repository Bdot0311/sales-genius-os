import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import {
  DEFAULT_RUBRIC,
  RubricWeights,
  scoreLead,
  SignalEventInput,
} from "../_shared/lead-scoring.ts";
import { REASON_SYSTEM_PROMPT, reasonUserPayload } from "./prompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAID_PLANS = new Set(["starter", "growth", "pro", "agency"]);
const GROWTH_PLUS = new Set(["growth", "pro", "agency"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Strip anything that violates the copy style, as a backstop to the prompt.
function sanitizeReason(s: string): string {
  return s
    .replace(/[—–]/g, ", ")
    .replace(/!+/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

async function polishReason(payload: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        messages: [
          { role: "system", content: REASON_SYSTEM_PROMPT },
          { role: "user", content: payload },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    let jsonStr = content.trim();
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonStr = fenced[1].trim();
    else {
      const a = jsonStr.indexOf("{"), b = jsonStr.lastIndexOf("}");
      if (a !== -1 && b > a) jsonStr = jsonStr.slice(a, b + 1);
    }
    const parsed = JSON.parse(jsonStr);
    const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
    return reason ? sanitizeReason(reason) : null;
  } catch {
    return null; // fail closed to the deterministic reason
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Invalid user token" }, 401);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    // Rubric editor live preview: score a sample of the user's leads with the
    // supplied override weights, writing nothing. Uses the same deterministic
    // engine, so the preview matches a real rescore. Gated to Growth and above.
    if (body.dryRun === true) {
      const { data: adminRole } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (adminRole?.role !== "admin") {
        const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
        if (!GROWTH_PLUS.has((sub?.plan || "free").toLowerCase())) {
          return json({ error: "rubric editing is available on growth and above.", error_code: "upgrade_required" }, 403);
        }
      }
      const weights: RubricWeights = (body.weights as RubricWeights) || DEFAULT_RUBRIC;
      const sampleLimit = Math.min(Math.max(Number(body.sampleLimit) || 10, 1), 25);
      const { data: icpRow } = await supabase
        .from("icp_profiles")
        .select("industries, company_size_min, company_size_max, seniority_levels, departments, target_titles, geographies, tech_stack")
        .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const { data: sampleLeads } = await supabase
        .from("leads")
        .select("id, industry, company_size, job_title, company_name, contact_name")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(sampleLimit);
      const nowMs = Date.parse(new Date().toISOString());
      const preview = [];
      for (const l of sampleLeads || []) {
        const { data: events } = await supabase
          .from("signal_events").select("signal_type, weight, occurred_at, metadata")
          .eq("lead_id", (l as any).id).eq("user_id", user.id);
        const r = scoreLead(l as any, (icpRow as any) || null, (events as SignalEventInput[]) || [], weights, nowMs);
        preview.push({
          lead_id: (l as any).id,
          company_name: (l as any).company_name,
          contact_name: (l as any).contact_name,
          tier: r.tier, fit_score: r.fit_score, intent_score: r.intent_score, reason: r.reason,
        });
      }
      return json({ preview });
    }

    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    if (!leadId) return json({ error: "leadId is required", error_code: "invalid_input" }, 400);

    // Tier gating (server-side): scoring is a paid-plan feature. Admins bypass.
    const { data: adminRole } = await supabase
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = adminRole?.role === "admin";
    if (!isAdmin) {
      const { data: sub } = await supabase
        .from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
      const plan = (sub?.plan || "free").toLowerCase();
      if (!PAID_PLANS.has(plan)) {
        return json({ error: "lead scoring is available on paid plans.", error_code: "upgrade_required" }, 403);
      }
    }

    // Load the lead (scoped to the user), the ICP, the signal events, the rubric.
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, industry, company_size, job_title, company_name")
      .eq("id", leadId).eq("user_id", user.id).maybeSingle();
    if (leadErr) return json({ error: "could not load lead", error_code: "db_error" }, 500);
    if (!lead) return json({ error: "lead not found", error_code: "not_found" }, 404);

    const { data: icpRow } = await supabase
      .from("icp_profiles")
      .select("industries, company_size_min, company_size_max, seniority_levels, departments, target_titles, geographies, tech_stack")
      .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();

    const { data: events } = await supabase
      .from("signal_events")
      .select("signal_type, weight, occurred_at, metadata")
      .eq("lead_id", leadId).eq("user_id", user.id);

    const { data: rubricRow } = await supabase
      .from("scoring_rubric").select("weights").eq("user_id", user.id).maybeSingle();
    const rubric: RubricWeights = (rubricRow?.weights as RubricWeights) || DEFAULT_RUBRIC;

    // Deterministic scoring. nowMs is fixed for this request.
    const nowMs = Date.parse(new Date().toISOString());
    const result = scoreLead(
      lead as any,
      (icpRow as any) || null,
      (events as SignalEventInput[]) || [],
      rubric,
      nowMs,
    );

    // Reason: try the model, fall back to the deterministic sentence.
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    let reason = result.reason;
    if (apiKey) {
      const polished = await polishReason(
        reasonUserPayload({
          tier: result.tier,
          fit_score: result.fit_score,
          intent_score: result.intent_score,
          fits_on: Object.entries(result.breakdown.fit.matched).filter(([, v]) => v).map(([k]) => k),
          top_signal: result.breakdown.intent.top_signal,
          most_recent_days: result.breakdown.intent.most_recent_days,
          repeat_account: result.breakdown.intent.repeat_account,
        }),
        apiKey,
      );
      if (polished) reason = polished;
    }

    const scoredAt = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("leads")
      .update({
        fit_score: result.fit_score,
        intent_score: result.intent_score,
        tier: result.tier,
        score_reason: reason,
        scored_at: scoredAt,
        score_breakdown: result.breakdown,
      })
      .eq("id", leadId).eq("user_id", user.id);
    if (updErr) return json({ error: "could not save score", error_code: "db_error" }, 500);

    return json({
      lead_id: leadId,
      fit_score: result.fit_score,
      intent_score: result.intent_score,
      tier: result.tier,
      reason,
      scored_at: scoredAt,
      breakdown: result.breakdown,
    });
  } catch (e) {
    console.error("[score-lead-v2] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
