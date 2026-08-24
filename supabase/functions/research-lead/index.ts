import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { toSignalFacts, type SignalEventRow } from "../_shared/signal-facts.ts";
import { coldiqConfigured, coldiqFetchPages } from "../_shared/coldiq.ts";
import {
  briefToPromptBlock,
  isResearchFresh,
  resolveLeadDomain,
  scoreResearchQuality,
  type LeadResearchBrief,
} from "../_shared/lead-research.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CANDIDATE_PATHS = [
  "/about",
  "/pricing",
  "/product",
  "/products",
  "/customers",
  "/case-studies",
  "/careers",
  "/blog",
  "/news",
];
const MAX_PAGES = 6; // homepage + up to 5 extra
const FETCH_TIMEOUT_MS = 9_000;
const MAX_TEXT_CHARS = 14_000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const LEAD_SELECT =
  "id, user_id, company_name, contact_name, contact_email, company_website, job_title, department, seniority, industry, company_size, employee_count, technologies, company_description, notes, signals, signal_type, intent_reasons, recommended_angle, linkedin_url, company_linkedin, research_brief, research_sources, research_confidence, researched_at, updated_at, enriched_at, icp_score, intent_score, intent_label, tier, score_reason";

function extractText(html: string): { text: string; meta: string } {
  const metaBits: string[] = [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) metaBits.push(`Title: ${title.trim()}`);
  const metaRe =
    /<meta[^>]+(?:name|property)=["'](description|og:title|og:description|og:site_name)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const content = m[0].match(/content=["']([^"']*)["']/i)?.[1];
    if (content) metaBits.push(`${m[1]}: ${content.trim()}`);
  }

  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { text: body, meta: metaBits.join("\n") };
}

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `You are a B2B sales researcher. You read a prospect company's own website and produce a research brief a rep can use to write a genuinely personalized cold email.

ABSOLUTE RULES:
- Every observation must be traceable to the supplied website text. Never infer, never speculate, never invent.
- Never invent funding rounds, launches, hires, customer names, revenue, headcount, percentages, or metrics.
- If the site text is too thin to support concrete observations, return an empty observations array and confidence "low". An empty brief is correct; a plausible-sounding invented brief is a failure.
- Observations must be specific enough that they could not plausibly apply to a different company.

Return ONLY a valid JSON object (no prose, no code fences) with exactly these fields:
{
  "what_they_do": string,        // one plain-language sentence
  "who_they_sell_to": string,    // their customer, one short phrase or sentence; "" if unclear
  "observations": [ { "fact": string, "source": string } ],  // 3-5 max, each under 25 words, source = the page URL it came from
  "hooks": [ string ],           // 2-3 max personalization angles, each tied to one observation
  "avoid": [ string ],           // claims a rep should NOT make because the site does not support them
  "confidence": "high" | "medium" | "low"
}`;

interface ModelResult {
  brief: LeadResearchBrief;
}

async function generateBrief(
  siteText: string,
  leadContext: string,
  apiKey: string,
): Promise<ModelResult> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Prospect we are researching:\n${leadContext}\n\nTheir website content:\n\n${siteText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("rate_limit");
    if (response.status === 402) throw new Error("ai_credits");
    const errorText = await response.text();
    console.error("[research-lead] AI gateway error:", response.status, errorText);
    throw new Error("ai_failed");
  }

  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content || "";
  let jsonStr = content;
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonStr = fenced[1].trim();
  const raw = JSON.parse(jsonStr) as Record<string, unknown>;

  const str = (v: unknown, max = 400): string =>
    typeof v === "string" ? v.trim().slice(0, max) : "";
  const strArray = (v: unknown, max = 4): string[] =>
    Array.isArray(v)
      ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim().slice(0, 240)).slice(0, max)
      : [];

  const observations = Array.isArray(raw.observations)
    ? (raw.observations as Record<string, unknown>[])
        .filter((o) => o && typeof o.fact === "string" && (o.fact as string).trim())
        .map((o) => ({
          fact: str(o.fact, 240),
          source: str(o.source, 300),
        }))
        .slice(0, 5)
    : [];

  const confidenceRaw = str(raw.confidence, 10).toLowerCase();
  const confidence: LeadResearchBrief["confidence"] =
    confidenceRaw === "high" || confidenceRaw === "medium" ? confidenceRaw : "low";

  return {
    brief: {
      what_they_do: str(raw.what_they_do, 400),
      who_they_sell_to: str(raw.who_they_sell_to, 300),
      observations,
      hooks: strArray(raw.hooks, 3),
      avoid: strArray(raw.avoid, 4),
      confidence: observations.length === 0 ? "low" : confidence,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    // Demo mode: simulate instead of hitting providers or spending credits
    if (user && await isDemoMode(supabase, user.id)) {
      return demoResponse({ message: 'Research simulated in demo mode — no credits spent.' }, corsHeaders);
    }
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    const force = body.force === true;
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId is required", error_code: "bad_request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select(LEAD_SELECT)
      .eq("id", leadId)
      .maybeSingle();
    if (leadError || !lead || lead.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Lead not found or unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fresh brief already stored — hand it back without spending a scrape.
    if (!force && isResearchFresh(lead as Record<string, unknown>)) {
      const cachedBrief = lead.research_brief as LeadResearchBrief;
      const cachedSources = (lead.research_sources as string[]) || [];
      const quality = scoreResearchQuality(cachedBrief, cachedSources);
      return new Response(
        JSON.stringify({
          brief: { ...cachedBrief, quality },
          sources: cachedSources,
          confidence: lead.research_confidence,
          quality,
          researched_at: lead.researched_at,
          cached: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    // Scraping + a model call is expensive: cap per user per day.
    const rl = await rateLimit(`research-lead:${user.id}`, 300, 86_400);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter, corsHeaders);

    const host = resolveLeadDomain(lead as Record<string, unknown>);
    if (!host) {
      return new Response(
        JSON.stringify({
          error: "No company website on this lead, so there's nothing to research. Add a website or enrich the lead first.",
          error_code: "no_domain",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const origin = `https://${host}`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[research-lead] LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Research is temporarily unavailable.", error_code: "not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const homepage = await fetchPage(origin);
    if (homepage === null) {
      return new Response(
        JSON.stringify({
          error: `We couldn't reach ${host}. The email will use the lead's existing data instead.`,
          error_code: "unreachable",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const pages: { url: string; html: string }[] = [{ url: origin, html: homepage }];
    for (const path of CANDIDATE_PATHS) {
      if (pages.length >= MAX_PAGES) break;
      const url = `${origin}${path}`;
      const html = await fetchPage(url);
      if (html) pages.push({ url, html });
    }

    let bodyText = "";
    const metaParts: string[] = [];
    const chunks: string[] = [];
    for (const page of pages) {
      const { text, meta } = extractText(page.html);
      if (meta) metaParts.push(`${page.url}\n${meta}`);
      bodyText += ` ${text}`;
      chunks.push(`--- PAGE: ${page.url} ---\n${text.slice(0, 4_000)}`);
    }
    bodyText = bodyText.replace(/\s+/g, " ").trim();

    // ─── Rescue a page our own scraper could not read ────────────────────────
    //
    // We fetch the HTML and strip <script> tags. That works for a
    // server-rendered site and returns almost nothing for a single-page app:
    // the served HTML is an empty root div plus bundles. Most modern startup
    // marketing sites are SPAs, which is why grounding sat near one lead in
    // five — the research was not weak, it never had any text to work from.
    //
    // This runs BEFORE siteText is assembled, because the emptiest SPAs would
    // otherwise hit the empty_content return below and never be rescued at all.
    // Only fires when the direct read came back thin, so a site we could
    // already read never costs a credit.
    if (bodyText.length < 400 && coldiqConfigured()) {
      const { text: rescued, error: fetchErr } = await coldiqFetchPages(pages.map((p) => p.url));
      if (fetchErr) {
        console.log('[research-lead] web fetch rescue unavailable:', fetchErr);
      } else if (rescued.length > bodyText.length) {
        console.log(`[research-lead] rescued ${rescued.length} chars from a page we could not read`);
        bodyText = rescued.replace(/\s+/g, " ").trim();
        chunks.push(`--- EXTRACTED TEXT ---\n${bodyText.slice(0, 8_000)}`);
      }
    }

    let siteText = `${metaParts.join("\n\n")}\n\n${chunks.join("\n\n")}`.trim();
    if (siteText.length > MAX_TEXT_CHARS) siteText = siteText.slice(0, MAX_TEXT_CHARS);
    if (!siteText) {
      return new Response(
        JSON.stringify({
          error: `We couldn't read enough from ${host} to research it.`,
          error_code: "empty_content",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const thinSite = bodyText.length < 400;

    const leadContextLines = [
      `- Company: ${lead.company_name || host}`,
      `- Website: ${origin}`,
    ];
    if (lead.contact_name) leadContextLines.push(`- Contact: ${lead.contact_name}`);
    if (lead.job_title) leadContextLines.push(`- Role: ${lead.job_title}`);
    if (lead.industry) leadContextLines.push(`- Industry: ${lead.industry}`);
    if (lead.company_size) leadContextLines.push(`- Company size: ${lead.company_size}`);
    if (Array.isArray(lead.technologies) && lead.technologies.length) {
      leadContextLines.push(`- Known tech: ${lead.technologies.slice(0, 8).join(", ")}`);
    }
    if (Array.isArray(lead.signals) && lead.signals.length) {
      leadContextLines.push(`- Known signals: ${lead.signals.slice(0, 6).join(", ")}`);
    }
    if (lead.recommended_angle) leadContextLines.push(`- Suggested angle: ${lead.recommended_angle}`);

    // The scores are the research brief's brief. Intent says whether something
    // has actually happened at this account — a tech-stack change, a raise, a
    // hiring burst — and fit says how close they are to who the user sells to.
    // Researching without them produced the same generic brief for a lead with
    // a fresh competitor churn as for one with nothing on record.
    if (lead.icp_score != null) {
      leadContextLines.push(`- ICP fit: ${lead.icp_score}/100${lead.tier ? ` (tier ${lead.tier})` : ""}`);
    }
    if (lead.intent_score != null) {
      leadContextLines.push(
        `- Buying intent: ${lead.intent_score}/100${lead.intent_label ? ` (${lead.intent_label})` : ""}` +
        ` — lead the brief with what drove this if it is high, and say plainly that nothing has fired if it is low`,
      );
    }
    if (lead.score_reason) leadContextLines.push(`- Why it scored that way: ${lead.score_reason}`);

    // ─── Detected events: the half of the research a website cannot supply ────
    //
    // The detectors already found what actually earns a reply — a Form D filed
    // last month, a Head of Growth posted three weeks ago, Segment added to the
    // stack — with a date and a citable source. Until now that drove the intent
    // score and stopped there, while the copy was researched from marketing
    // pages that say the same thing to every visitor and carry no timing.
    const { data: signalRows } = await supabase
      .from("signal_events")
      .select("signal_type, occurred_at, source, metadata")
      .eq("lead_id", leadId)
      .eq("user_id", user.id)
      .order("occurred_at", { ascending: false })
      .limit(25);

    const signalFacts = toSignalFacts((signalRows ?? []) as SignalEventRow[]);
    if (signalFacts.length) {
      leadContextLines.push(
        "- VERIFIED EVENTS at this account (dated, sourced — these are the strongest opener material available, stronger than anything on their website):",
        ...signalFacts.map((f) => `    • ${f.fact}  [${f.source}]`),
        "  Build at least one hook on one of these. They are what makes the email timely rather than merely accurate.",
      );
    }

    let result: ModelResult;
    try {
      result = await generateBrief(siteText, leadContextLines.join("\n"), LOVABLE_API_KEY);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "rate_limit") {
        return new Response(
          JSON.stringify({ error: "Too many requests right now. Try again in a moment.", error_code: "rate_limit" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (msg === "ai_credits") {
        return new Response(
          JSON.stringify({ error: "Research is temporarily unavailable.", error_code: "ai_credits" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.warn("[research-lead] first generation failed, retrying:", msg);
      try {
        result = await generateBrief(siteText, leadContextLines.join("\n"), LOVABLE_API_KEY);
      } catch (e2) {
        console.error("[research-lead] failed after retry:", e2 instanceof Error ? e2.message : e2);
        return new Response(
          JSON.stringify({ error: "We couldn't build a research brief from that site.", error_code: "generation_failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const sources = pages.map((p) => p.url);

    // Signal facts are merged in rather than asked for. They are verified
    // events with dates and citable sources, so routing them through a
    // generator could only lose or soften them — and the model has already
    // shown it will write around evidence it was given. They lead the
    // observation list because recency is what a cold open trades on.
    const modelObservations = (result.brief.observations ?? []).filter((o) => o?.fact);
    const mergedObservations = [
      ...signalFacts.map((f) => ({ fact: f.fact, source: f.source })),
      ...modelObservations,
    ];

    const baseBrief: LeadResearchBrief = {
      ...result.brief,
      observations: mergedObservations,
      confidence: thinSite && result.brief.confidence === "high"
        // A dated, sourced event is evidence a thin website cannot undo.
        ? (signalFacts.length ? "high" : "medium")
        : result.brief.confidence,
    };
    // Deterministic completeness score so every surface gates the same way.
    const quality = scoreResearchQuality(baseBrief, sources);
    const brief: LeadResearchBrief = { ...baseBrief, quality };
    const researchedAt = new Date().toISOString();

    const { error: writeError } = await supabase
      .from("leads")
      .update({
        research_brief: brief,
        research_sources: [...sources, ...signalFacts.map((f) => f.source)],
        research_confidence: brief.confidence,
        researched_at: researchedAt,
      })
      .eq("id", leadId)
      .eq("user_id", user.id);
    if (writeError) {
      console.error("[research-lead] failed to persist brief:", writeError.message);
    }

    console.log(
      "[research-lead]",
      host,
      "pages:", pages.length,
      "observations:", brief.observations.length,
      "confidence:", brief.confidence,
      "quality:", quality.score, quality.label,
    );

    return new Response(
      JSON.stringify({
        brief,
        sources,
        confidence: brief.confidence,
        quality,
        researched_at: researchedAt,
        prompt_block: briefToPromptBlock(brief, sources),
        cached: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (error) {
    console.error("[research-lead] unexpected error:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again.", error_code: "internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
