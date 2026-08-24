import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { AI_CREDITS_USER_MESSAGE, isAiCreditError, reportAiCreditsExhausted } from "../_shared/ai-credits.ts";
import { aiFetch } from "../_shared/ai-provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Company-size buckets the lead search understands (must match Leads.tsx mapping).
const ALLOWED_SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"];

// High-signal paths we probe in addition to the homepage. Best effort.
const CANDIDATE_PATHS = ["/about", "/pricing", "/product", "/customers", "/case-studies"];

const MAX_PAGES = 5; // homepage + up to 4 extra
const FETCH_TIMEOUT_MS = 10_000;
const MAX_TEXT_CHARS = 12_000; // token budget before sending to the model
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

// ─── Domain normalization ──────────────────────────────────────────────────
// Accepts "acme.com", "www.acme.com", "https://acme.com/pricing" → { origin, host }.
function normalizeDomain(input: unknown): { origin: string; host: string } | null {
  if (typeof input !== "string") return null;
  let raw = input.trim().toLowerCase();
  if (!raw || /\s/.test(raw)) return null;
  if (!/^https?:\/\//.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  // Require a dot and a plausible TLD; reject bare words / localhost.
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
  return { origin: `https://${host}`, host };
}

// ─── HTML → text extraction ────────────────────────────────────────────────
function extractText(html: string): { text: string; meta: string } {
  // Pull title + meta description + OG tags first (survive JS-rendered pages).
  const metaBits: string[] = [];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) metaBits.push(`Title: ${title.trim()}`);
  const metaRe = /<meta[^>]+(?:name|property)=["'](description|og:title|og:description|og:site_name)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const content = m[0].match(/content=["']([^"']*)["']/i)?.[1];
    if (content) metaBits.push(`${m[1]}: ${content.trim()}`);
  }

  // Strip non-content, headings kept inline, then collapse to text.
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
      headers: { "User-Agent": BROWSER_UA, "Accept": "text/html" },
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

// ─── Model call (Lovable AI Gateway, matches parse-lead-query) ───────────────
const SYSTEM_PROMPT = `You analyze a company's website and infer the Ideal Customer Profile of the company's CUSTOMERS — the businesses and people this company should SELL TO. Do NOT describe the company itself.

From the provided website text, determine what the company sells and who buys it, then output the target buyer profile as structured filters for a B2B lead search.

Return ONLY a valid JSON object with these fields:
- jobTitles: string[]   // concrete, searchable decision-maker titles only, e.g. ["VP of Sales", "Head of Marketing", "CMO"]. Max 6. No vague personas like "decision makers" or "leaders".
- industries: string[]  // real industry sectors the CUSTOMERS operate in, using standard names (e.g. "Computer Software", "Marketing and Advertising", "Financial Services", "Staffing and Recruiting"). Max 3. Do NOT use sales-motion phrases like "B2B Sales" or "Outbound Sales".
- companySizes: string[] // ONLY from: "1-10","11-50","51-200","201-500","501-1000","1000+"
- locations: string[]   // geographies of the customers (countries/regions), if inferable
- keywords: string[]    // up to 4 short intent/signal keywords describing the customers
- summary: string       // 1-2 sentence plain-English description of who they should sell to

If a field cannot be inferred, use an empty array. Never invent a specific city if none is implied. Output JSON only, no prose, no code fences.`;

function parseModelJson(content: string): Record<string, unknown> {
  let jsonStr = content.trim();
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    jsonStr = fenced[1].trim();
  } else {
    // Model sometimes wraps the JSON in prose ("Here is the ICP: { ... }").
    // Extract the outermost { ... } object so JSON.parse doesn't choke.
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start !== -1 && end > start) jsonStr = jsonStr.slice(start, end + 1);
  }
  return JSON.parse(jsonStr);
}

const PRIMARY_MODEL = "google/gemini-2.5-flash";
// Fallback is a cheaper model on a different provider: when the primary model
// is unavailable (capacity or per-model cap) this still produces a usable ICP
// instead of dead-ending the user's first real action in the product.
const FALLBACK_MODEL = "google/gemini-2.5-flash-lite";

async function generateICP(
  siteText: string,
  apiKey: string,
  userId: string,
  model: string = PRIMARY_MODEL,
): Promise<{ filters: Record<string, unknown>; summary: string }> {
  const response = await aiFetch("analyze-domain", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Website content:\n\n${siteText}` },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) throw new Error("rate_limit");
    const errorText = await response.text().catch(() => "");
    console.error("[analyze-domain] AI gateway error:", response.status, errorText);
    // An exhausted credit cap is not transient — retrying burns another call and
    // returns the same error, so alert the operator and surface it once.
    if (isAiCreditError(response.status, errorText)) {
      await reportAiCreditsExhausted({
        fn: "analyze-domain",
        userId,
        model,
        status: response.status,
        detail: errorText,
      });
      throw new Error("ai_credits");
    }
    throw new Error("ai_failed");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const raw = parseModelJson(content);

  const asArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim()) : [];

  const filters = {
    jobTitles: asArray(raw.jobTitles),
    industries: asArray(raw.industries),
    companySizes: asArray(raw.companySizes).filter((s) => ALLOWED_SIZES.includes(s)),
    locations: asArray(raw.locations),
    keywords: asArray(raw.keywords),
    limit: 50,
  };
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  return { filters, summary };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    // Auth — same JWT pattern as fetch-external-leads.
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
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit — 10 analyses per user per day (expensive: scrape + model).
    const rl = await rateLimit(`analyze-domain:${user.id}`, 10, 86_400);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter, corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const normalized = normalizeDomain(body.domain);
    if (!normalized) {
      return new Response(
        JSON.stringify({ error: "Enter a valid website, e.g. acme.com", error_code: "invalid_domain" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[analyze-domain] LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Analysis is temporarily unavailable.", error_code: "not_configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Homepage is required. If we can't reach it, the site is unreachable.
    const homepage = await fetchPage(normalized.origin);
    if (homepage === null) {
      return new Response(
        JSON.stringify({
          error: "We couldn't reach that site. Check the URL or describe your ICP manually instead.",
          error_code: "unreachable",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Best-effort extra pages, capped at MAX_PAGES total.
    const pages = [homepage];
    for (const path of CANDIDATE_PATHS) {
      if (pages.length >= MAX_PAGES) break;
      const html = await fetchPage(`${normalized.origin}${path}`);
      if (html) pages.push(html);
    }

    // 3. Extract text. Meta (title/description/OG) always kept; body may be thin on JS-rendered sites.
    let bodyText = "";
    const metaParts: string[] = [];
    for (const html of pages) {
      const { text, meta } = extractText(html);
      if (meta) metaParts.push(meta);
      bodyText += ` ${text}`;
    }
    bodyText = bodyText.replace(/\s+/g, " ").trim();
    const metaText = metaParts.join("\n");

    // 4. Low confidence when the body is near-empty (JS-rendered): lean on meta/OG.
    const lowConfidence = bodyText.length < 200;
    let siteText = `${metaText}\n\n${bodyText}`.trim();
    if (siteText.length > MAX_TEXT_CHARS) siteText = siteText.slice(0, MAX_TEXT_CHARS);
    if (!siteText) {
      return new Response(
        JSON.stringify({
          error: "We couldn't read enough from that site. Try describing your ICP manually instead.",
          error_code: "empty_content",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5. Generate ICP: primary model, then one retry, then a cheaper fallback
    //    model. Only a genuine credit cap on both models ends in an error.
    let result: { filters: Record<string, unknown>; summary: string };
    try {
      result = await generateICP(siteText, LOVABLE_API_KEY, user.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "rate_limit") {
        return new Response(
          JSON.stringify({ error: "Too many requests right now. Please try again in a moment.", error_code: "rate_limit" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Parse failure, transient error, or an exhausted cap on the primary
      // model — try again, then drop to the cheaper fallback model.
      console.warn("[analyze-domain] first generation failed, retrying:", msg);
      try {
        result = await generateICP(
          siteText,
          LOVABLE_API_KEY,
          user.id,
          msg === "ai_credits" ? FALLBACK_MODEL : PRIMARY_MODEL,
        );
      } catch (e2) {
        const msg2 = e2 instanceof Error ? e2.message : "";
        if (msg2 !== "ai_credits" && msg !== "ai_credits") {
          // Last chance on the fallback model before giving up.
          try {
            result = await generateICP(siteText, LOVABLE_API_KEY, user.id, FALLBACK_MODEL);
            console.log("[analyze-domain] recovered on fallback model");
            return new Response(
              JSON.stringify({ filters: result.filters, summary: result.summary, low_confidence: lowConfidence }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          } catch (_e3) {
            // fall through to the generic failure below
          }
        }
        console.error("[analyze-domain] generation failed after retry:", msg2 || e2);
        if (msg2 === "ai_credits" || msg === "ai_credits") {
          return new Response(
            JSON.stringify({
              error: `${AI_CREDITS_USER_MESSAGE} You can also describe your ICP manually below.`,
              error_code: "ai_credits",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ error: "We couldn't build an ICP from that site. Try again or describe your ICP manually.", error_code: "generation_failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    console.log("[analyze-domain]", normalized.host, "->", JSON.stringify(result.filters), "low_confidence:", lowConfidence);

    return new Response(
      JSON.stringify({ filters: result.filters, summary: result.summary, low_confidence: lowConfidence }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[analyze-domain] unexpected error:", error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: "Something went wrong. Please try again.", error_code: "internal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
