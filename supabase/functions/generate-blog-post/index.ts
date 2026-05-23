// Generates a single SEO-optimized blog post from the next queued topic
// and inserts it into blog_posts. Triggered by pg_cron biweekly.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const SYSTEM_PROMPT = `You are a senior B2B content strategist writing for SalesOS, an outbound sales platform for founders and small (1-10 person) sales teams. SalesOS lets users describe an ICP in plain English, get ranked verified prospects, and send AI-drafted personalized cold emails — all in one workflow. It replaces stacks like Apollo + Instantly + Salesloft for small teams.

Voice: confident, no startup fluff, no emojis, no exclamation marks. Direct sentences. Concrete examples and numbers. Never fabricate ratings, user counts, testimonials, or customer names — SalesOS has no public users yet to cite.

Write in markdown. Use ## for section headings, ### sparingly, - for bullet lists, **bold** for emphasis, [text](url) for links. You may include one markdown table when helpful (use | pipes |). Internal link to https://salesos.alephwavex.io once near the end with a clear CTA. You may also link to /blog, /pricing, /apollo-alternative, /sales-operations-software, or /blog/apollo-vs-instantly-vs-salesloft if relevant.

Length: 800-1200 words. Open with a 1-2 sentence answer-first paragraph (AEO-optimized) before the first heading. End with a "## The Bottom Line" section with a clear CTA.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // Restrict to service-role callers (pg_cron / internal). Reject anonymous and end-user JWTs.
  const authHeader = req.headers.get("Authorization") || "";
  const bearer = authHeader.replace("Bearer ", "");
  if (!bearer || bearer !== SERVICE_ROLE) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ success: false, error: "LOVABLE_API_KEY missing" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // 1. Pick oldest unused topic by priority
    const { data: topics, error: topicErr } = await supabase
      .from("blog_topic_queue")
      .select("*")
      .is("used_at", null)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);

    if (topicErr) throw new Error(`topic query failed: ${topicErr.message}`);
    if (!topics || topics.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Topic queue empty — add more topics to blog_topic_queue" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const topic = topics[0];

    // 2. Generate post via Lovable AI Gateway with structured output
    const userPrompt = `Write a blog post targeting the SEO keyword: "${topic.target_keyword}".

Topic brief: ${topic.topic_brief}

Category: ${topic.category}
Supporting keywords to weave in naturally: ${(topic.keywords || []).join(", ")}

Return a JSON object with these exact fields:
- "title": string, 50-65 characters, includes the target keyword naturally
- "description": string, 140-160 characters, meta-description quality
- "reading_time": string like "5 min read"
- "content": full markdown body following the system prompt rules`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const body = await aiRes.text();
      return new Response(
        JSON.stringify({ success: false, error: `AI gateway ${aiRes.status}: ${body}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content;
    if (!raw) throw new Error("AI returned no content");

    let parsed: { title: string; description: string; reading_time: string; content: string };
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      throw new Error(`AI returned non-JSON: ${String(raw).slice(0, 200)}`);
    }

    if (!parsed.title || !parsed.description || !parsed.content) {
      throw new Error("AI response missing required fields");
    }

    // 3. Build slug, dedupe if collision
    let slug = slugify(parsed.title);
    const { data: existing } = await supabase
      .from("blog_posts")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

    // 4. Insert post
    const { data: inserted, error: insertErr } = await supabase
      .from("blog_posts")
      .insert({
        slug,
        title: parsed.title.trim(),
        description: parsed.description.trim(),
        content: parsed.content.trim(),
        category: topic.category,
        keywords: topic.keywords || [],
        reading_time: parsed.reading_time?.trim() || "6 min read",
        source: "ai",
      })
      .select("id, slug, title")
      .single();

    if (insertErr) throw new Error(`insert failed: ${insertErr.message}`);

    // 5. Mark topic used
    await supabase
      .from("blog_topic_queue")
      .update({ used_at: new Date().toISOString() })
      .eq("id", topic.id);

    return new Response(
      JSON.stringify({
        success: true,
        post: inserted,
        topic_used: topic.target_keyword,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate-blog-post error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
