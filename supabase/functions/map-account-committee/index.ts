import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const PRO_PLUS = new Set(["pro", "agency"]);

function json(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const FUNCTION_TERMS: Record<string, string[]> = {
  exec: ["ceo", "chief executive", "founder", "co-founder", "president", "owner", "general manager"],
  sales: ["sales", "revenue", "business development", "account executive", "sdr", "bdr", "growth"],
  marketing: ["marketing", "demand generation", "brand", "communications", "growth"],
  technical: ["engineering", "engineer", "technology", "technical", "software", "developer", "devops", "information technology", " it ", "cto", "cio"],
  finance: ["finance", "financial", "accounting", "procurement", "purchasing", "cfo"], operations: ["operations", "operational", "coo"], hr: ["people", "human resources", "talent", "hr"],
};
const SENIORITY_TERMS: Record<string, string[]> = {
  cxo: ["chief", "ceo", "cto", "cfo", "coo", "cmo", "cio", "cro", "founder", "president", "owner"],
  c_level: ["chief", "ceo", "cto", "cfo", "coo", "cmo", "cio", "cro", "founder", "president", "owner"],
  vp: ["vice president", "vp", "head of", "chief", "ceo", "cto", "cfo", "coo", "cmo", "cio", "cro"],
  director: ["director", "head of", "vice president", "vp", "chief"], manager: ["manager", "lead", "director", "head of"],
  ic: ["executive", "representative", "specialist", "associate", "engineer", "developer", "analyst", "consultant", "sdr", "bdr"],
};
function bestPersona(contact: any, personas: any[]): string | null {
  const title = ` ${String(contact.job_title || "").toLowerCase()} `;
  if (!title.trim()) return null;
  let best: { label: string; score: number } | null = null;
  for (const persona of personas) {
    let score = 0;
    const label = String(persona.label || "").toLowerCase();
    const fn = String(persona.function || "").toLowerCase();
    const band = String(persona.seniority_band || "").toLowerCase();
    for (const term of FUNCTION_TERMS[fn] || []) if (title.includes(term)) score += 4;
    for (const term of SENIORITY_TERMS[band] || []) if (title.includes(term)) score += 2;
    for (const word of label.split(/\s+/).filter((w: string) => w.length > 3)) if (title.includes(word)) score += 1;
    if (label.includes("economic buyer") && /\b(ceo|founder|owner|president|chief|vp|vice president)\b/.test(title)) score += 5;
    if (label.includes("champion") && /\b(head|director|vp|vice president|manager)\b/.test(title)) score += 3;
    if (label.includes("technical") && /\b(cto|cio|engineer|engineering|technical|technology|developer|devops|it)\b/.test(title)) score += 6;
    if (label.includes("end user") && /\b(executive|representative|specialist|associate|sdr|bdr|engineer|developer|analyst)\b/.test(title)) score += 4;
    if (score > (best?.score || 0)) best = { label: persona.label, score };
  }
  return best && best.score >= 3 ? best.label : null;
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

    // Tier gating (server-side): Pro and Agency. Admins bypass.
    const { data: adminRole } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (adminRole?.role !== "admin") {
      const { data: sub } = await supabase.from("subscriptions").select("plan").eq("user_id", user.id).maybeSingle();
      if (!PRO_PLUS.has((sub?.plan || "free").toLowerCase())) {
        return json({ error: "the buying committee map is available on pro and agency.", error_code: "upgrade_required" }, 403);
      }
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) return json({ error: "companyId is required", error_code: "invalid_input" }, 400);

    const { data: company } = await supabase.from("companies").select("id, name").eq("id", companyId).eq("user_id", user.id).maybeSingle();
    if (!company) return json({ error: "account not found", error_code: "not_found" }, 404);

    // Personas — seed defaults if the user has none.
    let { data: personas } = await supabase.from("personas").select("*").eq("user_id", user.id).order("sort_order");
    if (!personas || personas.length === 0) {
      await supabase.rpc("seed_personas", { p_user_id: user.id });
      personas = (await supabase.from("personas").select("*").eq("user_id", user.id).order("sort_order")).data || [];
    }
    const labels = personas.map((p: any) => p.label);

    const { data: contacts } = await supabase
      .from("contacts").select("id, first_name, last_name, job_title, department, seniority, email")
      .eq("user_id", user.id).eq("company_id", companyId);

    // Classify each contact into one persona slot (or none). Constrained to the
    // defined labels; anything else is dropped so no label outside the set escapes.
    const assignments: Record<string, string> = {}; // contact_id -> label
    if (contacts && contacts.length > 0) {
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (apiKey) {
        const sys = `You map contacts to a buying-committee persona. Use ONLY these persona labels, or "none" if a contact fits none: ${labels.map((l) => `"${l}"`).join(", ")}. Return only JSON: {"assignments":[{"contact_id":"...","persona":"<one label or none>"}]}`;
        const usr = `Personas:\n${personas.map((p: any) => `- ${p.label} (seniority: ${p.seniority_band || "any"}, function: ${p.function || "any"})`).join("\n")}\n\nContacts:\n${contacts.map((c: any) => `- [${c.id}] ${c.job_title || ""} / ${c.department || ""} / ${c.seniority || ""}`).join("\n")}`;
        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "google/gemini-2.5-flash", temperature: 0, messages: [{ role: "system", content: sys }, { role: "user", content: usr }] }),
          });
          if (res.ok) {
            const content = (await res.json()).choices?.[0]?.message?.content || "";
            let s = content.trim();
            const a = s.indexOf("{"), b = s.lastIndexOf("}");
            if (a !== -1 && b > a) s = s.slice(a, b + 1);
            const parsed = JSON.parse(s);
            for (const row of parsed?.assignments || []) {
              // Validate the label is in the set; drop otherwise.
              if (row?.contact_id && typeof row.persona === "string" && labels.includes(row.persona)) {
                assignments[row.contact_id] = row.persona;
              }
            }
          }
        } catch (_) { /* classification best-effort; contacts fall to unassigned */ }
      }
    }

    // Fallback: assign the best-matching persona to any contact the AI left
    // unlabelled (or when no API key was configured). Runs after contacts and
    // personas are loaded, so it can actually read them.
    for (const contact of contacts || []) {
      if (!assignments[contact.id]) {
        const fallback = bestPersona(contact, personas || []);
        if (fallback) assignments[contact.id] = fallback;
      }
    }

    // Build slots.
    const slots = personas.map((p: any) => ({
      label: p.label,
      seniority_band: p.seniority_band,
      function: p.function,
      required: p.required,
      contacts: (contacts || [])
        .filter((c: any) => assignments[c.id] === p.label)
        .map((c: any) => ({ id: c.id, name: `${c.first_name || ""} ${c.last_name || ""}`.trim(), job_title: c.job_title, email: c.email })),
    }));

    const requiredSlots = slots.filter((s) => s.required);
    const filledRequired = requiredSlots.filter((s) => s.contacts.length > 0).length;
    const coverage = requiredSlots.length ? Math.round((filledRequired / requiredSlots.length) * 100) : 0;
    const gaps = slots.filter((s) => s.contacts.length === 0).map((s) => ({
      label: s.label, seniority_band: s.seniority_band, function: s.function, required: s.required,
    }));

    return json({ account: { id: company.id, name: company.name }, slots, coverage, gaps, contact_count: contacts?.length || 0 });
  } catch (e) {
    console.error("[map-account-committee] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
