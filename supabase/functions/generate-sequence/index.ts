// Sequence Generation Engine v2 (Phase 4). Generates a 4-touch cold email
// sequence grounded in a campaign brief and the payoff bank, ranks the hook,
// lints every touch against the style contract (regenerating on failure),
// guards against statistics that are not in the bank, and resolves tokens at
// generation time. Drafts only; no send path. See prompt-v2.ts for the prompt.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { SEQUENCE_SYSTEM_PROMPT, buildSequenceUserPayload } from "./prompt-v2.ts";
import { lintTouch } from "../_shared/style-lint.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PAID = new Set(["starter", "growth", "pro", "agency"]);
const GROWTH_PLUS = new Set(["growth", "pro", "agency"]);
const NUM_RE = /\b\d+(?:\.\d+)?%?\b/g;

function json(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function callGateway(system: string, userMsg: string, apiKey: string): Promise<string> {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) throw new Error(`gateway_${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseTouches(raw: string): any[] {
  let s = raw.trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  else { const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a !== -1 && b > a) s = s.slice(a, b + 1); }
  try { return JSON.parse(s)?.touches || []; } catch { return []; }
}

// Rank the most specific hook actually available. Nothing above persona pain
// means the prospect is under-personalized and should be flagged, not papered over.
function selectHook(input: { signal?: string; whyNow?: { claim: string; source?: string }; observation?: string; personaPain?: string; peer?: string }) {
  if (input.signal?.trim()) return { hook: input.signal.trim(), kind: "fired signal", low: false };
  if (input.whyNow?.claim?.trim() && input.whyNow.source) return { hook: `${input.whyNow.claim} (${input.whyNow.source})`, kind: "why-now research", low: false };
  if (input.observation?.trim()) return { hook: input.observation.trim(), kind: "account observation", low: false };
  if (input.peer?.trim()) return { hook: input.peer.trim(), kind: "peer reference", low: false };
  if (input.personaPain?.trim()) return { hook: input.personaPain.trim(), kind: "persona pain", low: true };
  return { hook: "", kind: "none", low: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // Plan: generation is paid; payoff bank + rubric loop are Growth+; Free gets single-touch.
    const { data: adminRole } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = adminRole?.role === "admin";
    const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
    const plan = (sub?.plan || "free").toLowerCase();
    if (!isAdmin && !PAID.has(plan)) return json({ error: "sequence generation is available on paid plans.", error_code: "upgrade_required" }, 403);
    const growthPlus = isAdmin || GROWTH_PLUS.has(plan);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const lead: any = body.lead ?? {};
    const senderName = String(body.senderName ?? "there").slice(0, 80);

    // Campaign brief (optional) + payoff bank (Growth+ only).
    let brief: any = null;
    if (typeof body.briefId === "string") {
      const { data } = await supabase.from("campaign_briefs").select("*").eq("id", body.briefId).eq("user_id", user.id).maybeSingle();
      brief = data;
    }
    let payoffBank: any[] = [];
    if (growthPlus) {
      const { data } = await supabase.from("payoff_bank").select("id, type, content, source_url, asserts_stat").eq("user_id", user.id);
      payoffBank = data || [];
    }

    // Hook selection.
    const hook = selectHook({
      signal: String(body.signal ?? (Array.isArray(lead.signals) ? lead.signals[0] : "") ?? ""),
      whyNow: body.whyNow as any,
      observation: body.observation as string | undefined,
      personaPain: brief?.pain_by_persona?.[lead.job_title] || String(body.personaPain ?? ""),
      peer: body.peer as string | undefined,
    });

    const resolvedTokens: Record<string, string> = {
      first_name: (lead.contact_name || "").split(/\s+/)[0] || "",
      company: lead.company_name || "",
      job_title: lead.job_title || "",
      sender_first_name: senderName.split(/\s+/)[0],
    };
    // Token resolution guard: if a required token can't be resolved, block and flag.
    const missingTokens = Object.entries(resolvedTokens).filter(([k, v]) => (k === "first_name" || k === "company") && !v).map(([k]) => k);
    if (missingTokens.length) {
      return json({ touches: [], blocked: true, reason: "unresolved_tokens", missing_tokens: missingTokens });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "generation is temporarily unavailable.", error_code: "not_configured" });

    const prospect = [
      `name: ${resolvedTokens.first_name}`, `company: ${lead.company_name || ""}`,
      `title: ${lead.job_title || ""}`, `industry: ${lead.industry || ""}`,
      `size: ${lead.company_size || lead.employee_count || ""}`,
    ].join("\n");
    const forbidden = Array.isArray(brief?.forbidden_claims) ? brief.forbidden_claims : [];
    const bankContents = payoffBank.map((p) => String(p.content).toLowerCase());

    let touches: any[] = [];
    let retryNote = "";
    // Up to two attempts: generate, then lint + stat-guard; regenerate once naming the failures.
    for (let attempt = 0; attempt < 2; attempt++) {
      const payload = buildSequenceUserPayload({
        hook: hook.hook, hookKind: hook.kind, prospect,
        personaPain: brief?.pain_by_persona?.[lead.job_title], offer: brief?.offer,
        payoffBank, forbiddenClaims: forbidden, resolvedTokens, retryNote,
      });
      let raw = "";
      try { raw = await callGateway(SEQUENCE_SYSTEM_PROMPT, payload, apiKey); }
      catch { return json({ error: "could not generate the sequence right now.", error_code: "ai_failed" }); }
      touches = parseTouches(raw);
      if (!growthPlus) touches = touches.slice(0, 1); // Free: single-touch

      // Validate each touch: style lint + stat-in-bank guard + token holes.
      const problems: string[] = [];
      for (const t of touches) {
        const lint = lintTouch(String(t.subject || ""), String(t.body || ""));
        if (!lint.ok) problems.push(...lint.violations);
        // any statistic in the body must appear in a bank entry
        const stats = String(t.body || "").match(NUM_RE) || [];
        for (const stat of stats) {
          if (!bankContents.some((c) => c.includes(stat.toLowerCase()))) {
            problems.push(`remove the number "${stat}" — it is not in the payoff bank`);
          }
        }
        if (/\{\{|\[[a-z]|<[a-z]/i.test(String(t.body || ""))) problems.push("resolve all tokens, leave no placeholder");
      }
      if (problems.length === 0) break;
      retryNote = Array.from(new Set(problems)).join("; ");
    }

    // Growth+: attach the R.E.P.L.Y. rubric to each touch so the user sees scores.
    let rubric: any[] | null = null;
    if (growthPlus && touches.length) {
      rubric = [];
      for (const t of touches) {
        try {
          const { data } = await supabase.functions.invoke("check-email-rubric", { body: { subject: t.subject, body: t.body } });
          rubric.push(data?.dimensions ? { day: t.day, dimensions: data.dimensions, weakest: data.weakest } : null);
        } catch { rubric.push(null); }
      }
    }

    return json({
      touches,
      hook: hook.hook,
      hook_kind: hook.kind,
      low_personalization: hook.low,
      lint_clean: retryNote === "",
      unresolved_style: retryNote || null,
      rubric,
    });
  } catch (e) {
    console.error("generate-sequence error", e instanceof Error ? e.message : e);
    return json({ error: "internal error" });
  }
});
