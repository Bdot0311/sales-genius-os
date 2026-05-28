// Auto-refills blog_topic_queue when unused topics drop below threshold.
// Triggered weekly by pg_cron. Uses Lovable AI to generate fresh SEO/AEO topics
// scoped to SalesOS (outbound sales, AI SDR, cold email, ICP, comparisons).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_UNUSED = 8;     // refill when fewer than this remain unused
const BATCH_SIZE = 20;    // how many to generate per refill run

const SYSTEM_PROMPT = `You are an SEO/AEO strategist for SalesOS — an outbound sales platform for founders and 1-10 person sales teams. SalesOS replaces stacks like Apollo + Instantly + Salesloft.

Generate ${BATCH_SIZE} fresh blog post topic ideas optimized for SEO and Answer Engine Optimization (AEO / LLM citations). Prioritize:
- "alternative" and comparison keywords ("X vs Y", "best X for Y")
- High-intent how-to keywords B2B founders actually search
- AEO-friendly question keywords ("what is...", "how to...")

Avoid generic fluff. Be specific. Never repeat topics that already exist (provided below).

Return ONLY a JSON object: { "topics": [ { "target_keyword": string, "topic_brief": 1-2 sentence brief, "category": one of ["Comparisons","Cold Email","Deliverability","AI Sales","ICP","Lead Generation","Outbound","Pipeline","CRM"], "keywords": array of 3-5 supporting keywords, "priority": integer 10-90 (lower = publish sooner; comparison/alternative = 10-30, how-to = 30-60, broader = 60-90) } ] }`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // Restrict to service-role callers (pg_cron / internal).
  const bearer = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!bearer || bearer !== SERVICE_ROLE) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // 1. Count unused topics
    const { count: unusedCount, error: countErr } = await supabase
      .from("blog_topic_queue")
      .select("id", { count: "exact", head: true })
      .is("used_at", null);

    if (countErr) throw new Error(`count failed: ${countErr.message}`);

    if ((unusedCount ?? 0) >= MIN_UNUSED) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, unused: unusedCount, threshold: MIN_UNUSED }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "LOVABLE_API_KEY missing" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Pull existing keywords to avoid duplicates (last 200)
    const { data: existing } = await supabase
      .from("blog_topic_queue")
      .select("target_keyword")
      .order("created_at", { ascending: false })
      .limit(200);
    const existingList = (existing || []).map((r) => r.target_keyword).join("; ");

    // 3. Ask Lovable AI for new topics
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Topics ALREADY in the queue or used (do not repeat or paraphrase):\n${existingList}\n\nGenerate ${BATCH_SIZE} new ones.`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(
        JSON.stringify({ success: false, error: `AI gateway ${aiRes.status}`, detail: errText.slice(0, 500) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiRes.json();
    const raw = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { topics?: Array<Record<string, unknown>> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "AI returned non-JSON", sample: raw.slice(0, 300) }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allowedCategories = new Set([
      "Comparisons","Cold Email","Deliverability","AI Sales","ICP",
      "Lead Generation","Outbound","Pipeline","CRM",
    ]);

    const rows = (parsed.topics || [])
      .map((t) => {
        const target_keyword = String(t.target_keyword || "").trim().slice(0, 200);
        const topic_brief = String(t.topic_brief || "").trim().slice(0, 1000);
        const category = allowedCategories.has(String(t.category)) ? String(t.category) : "Outbound";
        const keywords = Array.isArray(t.keywords)
          ? t.keywords.map((k) => String(k).trim()).filter(Boolean).slice(0, 8)
          : [];
        const priority = Math.min(100, Math.max(1, Number(t.priority) || 60));
        return { target_keyword, topic_brief, category, keywords, priority };
      })
      .filter((r) => r.target_keyword.length > 3 && r.topic_brief.length > 10);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "No valid topics parsed from AI response" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. De-dupe against existing keywords (case-insensitive)
    const existingLower = new Set((existing || []).map((r) => r.target_keyword.toLowerCase()));
    const fresh = rows.filter((r) => !existingLower.has(r.target_keyword.toLowerCase()));

    if (fresh.length === 0) {
      return new Response(
        JSON.stringify({ success: true, inserted: 0, reason: "All AI topics duplicated existing ones" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: insertErr } = await supabase.from("blog_topic_queue").insert(fresh);
    if (insertErr) throw new Error(`insert failed: ${insertErr.message}`);

    return new Response(
      JSON.stringify({ success: true, unused_before: unusedCount, inserted: fresh.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
