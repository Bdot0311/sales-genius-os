import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
// Growth+ feature; caps scale by tier.
const CAPS: Record<string, number> = { growth: 10, pro: 30, agency: 100 };
const STALE_DAYS = 14;

function json(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) return json({ error: "Invalid user token" }, 401);

    const { data: adminRole } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const isAdmin = adminRole?.role === "admin";
    const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
    const plan = (sub?.plan || "free").toLowerCase();
    const cap = isAdmin ? 1000 : (CAPS[plan] ?? 0);
    if (cap === 0) return json({ error: "why-now research is available on growth and above.", error_code: "upgrade_required" }, 403);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) return json({ error: "companyId is required", error_code: "invalid_input" }, 400);

    const { data: company } = await supabase
      .from("companies").select("id, name, domain, linkedin_url, industry")
      .eq("id", companyId).eq("user_id", user.id).maybeSingle();
    if (!company) return json({ error: "account not found", error_code: "not_found" }, 404);

    // Cache-first: a fresh cache does not consume quota.
    const { data: cached } = await supabase
      .from("why_now_research").select("claims, researched_at").eq("user_id", user.id).eq("company_id", companyId).maybeSingle();
    if (cached && cached.researched_at) {
      const ageDays = (Date.now() - Date.parse(cached.researched_at)) / 86_400_000;
      if (ageDays < STALE_DAYS && !body.force) {
        return json({ claims: cached.claims || [], from_cache: true, researched_at: cached.researched_at });
      }
    }

    // Gather the account's real detected signals from its leads.
    const { data: leads } = await supabase
      .from("leads").select("id, buying_signals, hiring_signals, signal_type, signal_date, intent_reasons")
      .eq("user_id", user.id).eq("company_name", company.name).limit(50);
    const leadIds = (leads || []).map((l: any) => l.id);
    let events: any[] = [];
    if (leadIds.length) {
      const { data: ev } = await supabase.from("signal_events").select("signal_type, occurred_at, metadata").in("lead_id", leadIds);
      events = ev || [];
    }

    // Build raw signals with a recency and a verifiable source url.
    const domainUrl = company.domain ? `https://${String(company.domain).replace(/^https?:\/\//, "")}` : null;
    const defaultSource = company.linkedin_url || domainUrl;
    type Raw = { text: string; date: string | null; source: string | null };
    const raw: Raw[] = [];
    for (const e of events) {
      raw.push({ text: String(e.signal_type || "").replace(/_/g, " "), date: e.occurred_at || null, source: (e.metadata?.source_url as string) || defaultSource });
    }
    for (const l of leads || []) {
      for (const s of [...(l.buying_signals || []), ...(l.hiring_signals || [])]) {
        if (typeof s === "string" && s.trim()) raw.push({ text: s.trim(), date: l.signal_date || null, source: defaultSource });
      }
      if (l.signal_type && l.signal_type !== "manual") raw.push({ text: String(l.signal_type).replace(/_/g, " "), date: l.signal_date || null, source: defaultSource });
    }
    // Only signals with a source url can become a rendered claim.
    const sourced = raw.filter((r) => r.source).slice(0, 12);

    // Nothing researchable: do not spend a quota unit and do not cache an empty
    // result (which would hide this account's why-now for STALE_DAYS).
    if (!sourced.length) {
      return json({ claims: [], from_cache: false, no_signals: true, researched_at: null });
    }

    // Cap: consume one unit only when we actually have something to research.
    const remaining = await supabase.rpc("consume_research", { p_user_id: user.id, p_cap: cap });
    if ((remaining.data as number) === -1) {
      return json({ error: "daily research limit reached. it resets tomorrow.", error_code: "cap_reached", remaining: 0 }, 429);
    }

    // Phrase each sourced signal into a one-line why-now claim. Confidence is set
    // deterministically by recency, not by the model.
    const claims: { claim: string; source_url: string; confidence: string }[] = [];
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (apiKey && sourced.length) {
      const sys = `You turn detected buying signals into short "why now" reasons to reach out. Use only the signal given, invent nothing. One plain lowercase-first sentence each, no em-dashes, no hype. Return only JSON: {"claims":["...", ...]} in the same order as the input.`;
      const usr = `Company: ${company.name} (${company.industry || ""})\nSignals:\n${sourced.map((r, i) => `${i + 1}. ${r.text}`).join("\n")}`;
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "google/gemini-2.5-flash", temperature: 0, messages: [{ role: "system", content: sys }, { role: "user", content: usr }] }),
        });
        if (res.ok) {
          let s = ((await res.json()).choices?.[0]?.message?.content || "").trim();
          const a = s.indexOf("{"), b = s.lastIndexOf("}");
          if (a !== -1 && b > a) s = s.slice(a, b + 1);
          const phrased: string[] = JSON.parse(s)?.claims || [];
          sourced.forEach((r, i) => {
            const text = (phrased[i] || r.text).replace(/[—–]/g, ", ").trim();
            const ageDays = r.date ? (Date.now() - Date.parse(r.date)) / 86_400_000 : Infinity;
            const confidence = ageDays <= 30 ? "high" : ageDays <= 90 ? "medium" : "low";
            claims.push({ claim: text, source_url: r.source!, confidence });
          });
        }
      } catch (_) { /* fall through with no claims */ }
    }

    await supabase.from("why_now_research").upsert(
      { user_id: user.id, company_id: companyId, claims, researched_at: new Date().toISOString() },
      { onConflict: "user_id,company_id" },
    );

    return json({ claims, from_cache: false, remaining: remaining.data, researched_at: new Date().toISOString() });
  } catch (e) {
    console.error("[research-account] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
