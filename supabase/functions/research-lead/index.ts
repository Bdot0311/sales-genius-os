import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { ownerOf, resolveCaller } from "../_shared/internal-auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.0";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { AI_CREDITS_USER_MESSAGE, isAiCreditError, reportAiCreditsExhausted } from "../_shared/ai-credits.ts";
import { toSignalFacts, type SignalEventRow } from "../_shared/signal-facts.ts";
import { backfillSourceFilter, detectorsToBackfill } from "../_shared/signal-backfill.ts";
import { coldiqConfigured, coldiqFetchPages } from "../_shared/coldiq.ts";
import {
  leadResearchQueries,
  parallelConfigured,
  parallelPromptBlock,
  parallelSearch,
  type ParallelResult,
} from "../_shared/parallel.ts";
import {
  briefToPromptBlock,
  isResearchFresh,
  normalizeOccurred,
  resolveLeadDomain,
  scoreResearchQuality,
  type LeadResearchBrief,
  researchInputs,
} from "../_shared/lead-research.ts";
import { AI_SMART, aiFetch } from "../_shared/ai-provider.ts";
import { diffBriefs } from "../_shared/brief-diff.ts";
import {
  FALLBACK_PATHS,
  isSitemapIndex,
  lastmodNote,
  parseSitemap,
  rankPages,
  sitemapsFromRobots,
  type DiscoveredPage,
  type SitemapEntry,
} from "../_shared/site-discovery.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The guessed paths are now the floor, not the plan — see _shared/site-discovery.ts.
const CANDIDATE_PATHS = FALLBACK_PATHS;
const MAX_PAGES = 8; // homepage + up to 7 discovered
const FETCH_TIMEOUT_MS = 9_000;
const MAX_TEXT_CHARS = 14_000;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

const LEAD_SELECT =
  "id, user_id, company_name, contact_name, contact_email, company_website, job_title, department, seniority, industry, company_size, employee_count, technologies, company_description, notes, signals, signal_type, intent_reasons, recommended_angle, linkedin_url, company_linkedin, research_brief, research_sources, research_confidence, researched_at, research_inputs, updated_at, enriched_at, icp_score, intent_score, intent_label, tier, score_reason";

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

/** How many sitemap documents one research run will pull. */
const MAX_SITEMAPS = 3;
/** Timeout for robots.txt and sitemaps, which are small static files. */
const META_TIMEOUT_MS = 4_000;
/** Entries taken from any one sitemap; large sites list tens of thousands. */
const MAX_SITEMAP_ENTRIES = 2_000;

/**
 * Fetch a non-HTML document — robots.txt, a sitemap.
 *
 * fetchPage refuses anything whose content-type is not HTML, which is correct
 * for pages and wrong for these: sitemaps are served as application/xml and
 * robots.txt as text/plain, so routing them through fetchPage returned null
 * every time.
 */
async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  // Shorter than a page fetch on purpose: robots.txt and a sitemap are small
  // static files, so one that is slow is one that is not coming, and every
  // second spent here comes out of the caller's 60-second budget.
  const timer = setTimeout(() => controller.abort(), META_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/plain, application/xml, text/xml, */*" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const text = await res.text();
    // A site that answers 200 with its SPA shell for every unknown path would
    // otherwise have its index.html parsed as a sitemap.
    if (/^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)) return null;
    return text.slice(0, 4_000_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
- DATE EVERY OBSERVATION YOU CAN. "occurred" is the date the PAGE states for that fact — a press-release date, "November 2025", a changelog entry, a copyright year on a dated announcement. Use "YYYY-MM-DD", "YYYY-MM" or "YYYY".
- If the page gives no date for a fact, fall back to that page's own last-changed date when one is supplied in a PAGE CHANGE DATES block, and only for a fact you read on that exact page. Otherwise "occurred" MUST be "". Never estimate one, never use today's date, never infer a date from context. A website is a standing document: an acquisition announced last November still sits on the About page today, and a rep who reads it as news writes an email the prospect knows is wrong.
- A page's last-changed date bounds how recent the fact can be, it does not prove the fact is that new. Use it as the date; never write "they announced this last week" on the strength of it alone.
- An EXTERNAL WEB RESEARCH block, when present, holds excerpts from independent sources with their URLs and publish dates. Treat it as read material exactly like the website text: an observation from it must cite that source URL, and may carry that source's publish date as "occurred". It is usually the only genuinely dated material available, so prefer it for hooks that trade on timing. Still never state anything the excerpts do not say.
- OPEN ROLES ARE THE STRONGEST MATERIAL ON A COMPANY'S OWN SITE. If a careers or jobs page was read, name the actual roles they are hiring for. What a company is staffing for says what it is building before any marketing page does, it is specific enough that no other company shares it, and job listings are dated. Treat a list of open roles as an observation, not as background.

Return ONLY a valid JSON object (no prose, no code fences) with exactly these fields:
{
  "what_they_do": string,        // one plain-language sentence
  "who_they_sell_to": string,    // their customer, one short phrase or sentence; "" if unclear
  "observations": [ { "fact": string, "source": string, "occurred": string } ],  // 3-5 max, fact under 25 words, source = the page URL it came from
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
  const response = await aiFetch("research-lead", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_SMART,
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
    const errorText = await response.text().catch(() => "");
    console.error("[research-lead] AI gateway error:", response.status, errorText);
    if (isAiCreditError(response.status, errorText)) {
      await reportAiCreditsExhausted({
        fn: "research-lead",
        model: AI_SMART,
        status: response.status,
        detail: errorText,
      });
      throw new Error("ai_credits");
    }
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
          // Normalized here rather than trusted: a date the model invented in
          // an unreadable shape becomes "" (undated, handled conservatively)
          // instead of a wrong date, which is not recoverable downstream.
          occurred: normalizeOccurred(o.occurred),
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
    /*
     * The batch worker holds the service role and is not a user. See
     * resolveCaller: one implementation, shared, so the copy that drifts
     * cannot exist.
     */
    const caller = await resolveCaller(req);
    if (!caller.ok) return caller.response;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    const force = body.force === true;

    // An internal caller says which lead; the database says whose it is.
    const userId = caller.internal
      ? await ownerOf(supabase, "leads", leadId, caller)
      : caller.userId;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Lead not found or unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Demo mode: simulate instead of hitting providers or spending credits
    if (await isDemoMode(supabase, userId)) {
      return demoResponse({ message: 'Research simulated in demo mode — no credits spent.' }, corsHeaders);
    }
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
    if (leadError || !lead || lead.user_id !== userId) {
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
    const rl = await rateLimit(`research-lead:${userId}`, 300, 86_400);
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

    // ─── External web research, run alongside the site read ──────────────────
    //
    // The company's own pages say the same thing to every visitor and almost
    // never carry a date. Independent sources do, which is what lets an
    // observation be dated — and a site we cannot read at all no longer ends
    // the research, because the outside world still has material on them.
    const webPromise: Promise<{ results: ParallelResult[]; sessionId: string | null; error: string | null }> =
      parallelConfigured()
        ? parallelSearch({
          objective:
            `Recent, dated developments at the company ${lead.company_name || host} (website ${host}): funding, ` +
            `acquisitions, product launches, partnerships, leadership hires, expansion or hiring pushes. ` +
            `Used to open a relevant cold email, so timing and a citable source matter more than background.`,
          queries: leadResearchQueries(String(lead.company_name ?? ""), host),
          maxResults: 8,
          timeoutMs: 20_000,
          // Their own site is read directly a few lines below; these slots are
          // for coverage they did not write themselves.
          excludeDomains: [host.replace(/^www\./, "")],
        })
        : Promise.resolve({ results: [], sessionId: null, error: "not_configured" });

    const homepage = await fetchPage(origin);
    const pages: { url: string; html: string }[] = [];
    if (homepage === null) {
      const fallbackWeb = await webPromise;
      if (!fallbackWeb.results.length) {
        return new Response(
          JSON.stringify({
            error: `We couldn't reach ${host}. The email will use the lead's existing data instead.`,
            error_code: "unreachable",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      console.log(
        `[research-lead] ${host} unreachable — researching from ${fallbackWeb.results.length} external sources`,
      );
    } else {
      pages.push({ url: origin, html: homepage });
    }

    // ─── Which other pages to read ───────────────────────────────────────────
    //
    // Ask the site rather than guessing at it. robots.txt names the sitemap,
    // the sitemap names every page and — the part that matters — when each one
    // last changed. That lastmod is the only machine-readable date most
    // marketing sites publish, and without it nearly every observation came
    // back undated, which the writer is required to treat as "do not imply
    // this is recent". Accurate research the copy was forbidden to use.
    let discovered: DiscoveredPage[] = [];
    try {
      const robots = await fetchText(`${origin}/robots.txt`);
      const sitemapUrls = robots ? sitemapsFromRobots(robots, origin) : [];
      // The two conventional locations, for a site whose robots.txt says nothing.
      for (const guess of [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`]) {
        if (!sitemapUrls.includes(guess)) sitemapUrls.push(guess);
      }

      const entries: SitemapEntry[] = [];
      let fetched = 0;
      for (const sitemapUrl of sitemapUrls) {
        if (fetched >= MAX_SITEMAPS || entries.length >= MAX_SITEMAP_ENTRIES) break;
        const xml = await fetchText(sitemapUrl);
        if (!xml) continue;
        fetched++;
        const parsed = parseSitemap(xml);
        if (isSitemapIndex(xml)) {
          // An index lists further sitemaps. Take the few most recently
          // changed — a large site has dozens and the old ones are archives.
          const children = parsed
            .slice()
            .sort((a, b) => (Date.parse(b.lastmod) || 0) - (Date.parse(a.lastmod) || 0))
            .slice(0, 2);
          for (const child of children) {
            if (fetched >= MAX_SITEMAPS) break;
            const childXml = await fetchText(child.url);
            if (!childXml) continue;
            fetched++;
            entries.push(...parseSitemap(childXml).slice(0, MAX_SITEMAP_ENTRIES));
          }
        } else {
          entries.push(...parsed.slice(0, MAX_SITEMAP_ENTRIES));
        }
      }
      discovered = rankPages(entries, origin, MAX_PAGES - 1);
      if (discovered.length) {
        console.log(
          `[research-lead] ${host}: sitemap gave ${entries.length} urls -> reading ${
            discovered.map((p) => p.reason).join(", ")
          }`,
        );
      }
    } catch (err) {
      console.warn("[research-lead] sitemap discovery failed:", err instanceof Error ? err.message : err);
    }

    // Read them together rather than one after another.
    //
    // Serially, seven pages at a nine-second timeout is over a minute on a
    // slow host, and generate-email gives this whole function sixty seconds.
    // The old code had the same shape with fewer pages and was already close
    // to the edge. Rank order is preserved because the results come back in
    // the order they were requested.
    const readWithDates: DiscoveredPage[] = [];
    const wanted = discovered.slice(0, MAX_PAGES - 1);
    const fetchedPages = await Promise.all(wanted.map((p) => fetchPage(p.url)));
    for (let i = 0; i < wanted.length; i++) {
      const html = fetchedPages[i];
      if (!html) continue;
      pages.push({ url: wanted[i].url, html });
      readWithDates.push(wanted[i]);
    }

    // No sitemap, or one that yielded nothing readable: fall back to guessing.
    if (pages.length === 1) {
      const guesses = CANDIDATE_PATHS.slice(0, MAX_PAGES - 1);
      const guessed = await Promise.all(guesses.map((path) => fetchPage(`${origin}${path}`)));
      for (let i = 0; i < guesses.length; i++) {
        if (guessed[i]) pages.push({ url: `${origin}${guesses[i]}`, html: guessed[i] as string });
      }
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

    // The sitemap's own change dates, handed over as a labelled block. This is
    // what lets an observation carry an `occurred` when the page copy states no
    // date — which is most pages.
    const dateBlock = lastmodNote(readWithDates);
    const web = await webPromise;
    const webBlock = parallelPromptBlock(web.results);
    if (web.results.length) {
      console.log(`[research-lead] ${host}: ${web.results.length} external web sources`);
    }
    let siteText = `${dateBlock ? `${dateBlock}\n\n` : ""}${webBlock ? `${webBlock}\n\n` : ""}${metaParts.join("\n\n")}\n\n${chunks.join("\n\n")}`.trim();
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
    //
    // A lead that was never enriched has never been through the detectors, so
    // research runs the news (PredictLeads), tech-stack (Bloomberry) and
    // hiring (public ATS boards) checks itself when nothing from one of them
    // is on record. They cache per domain and never throw into this path; a
    // slow or failed check just adds nothing.
    if (!caller.internal) {
      // Each detector is judged on the source prefix it writes. The decision
      // itself is in _shared/signal-backfill.ts, where it can be tested by
      // behaviour rather than by grepping this file.
      const { data: existing } = await supabase
        .from("signal_events").select("source")
        .eq("lead_id", leadId).eq("user_id", userId)
        .or(backfillSourceFilter()).limit(200);
      const missing = detectorsToBackfill(
        (existing ?? []).map((r: { source: string | null }) => r.source),
      );
      if (missing.length) {
        const base = Deno.env.get("SUPABASE_URL")!;
        const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        await Promise.allSettled(missing.map(async ({ fn }) => {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 12_000);
          try {
            const r = await fetch(`${base}/functions/v1/${fn}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: anon },
              body: JSON.stringify({ leadId }),
              signal: ctrl.signal,
            });
            await r.text();
          } catch (e) {
            console.error(`[research-lead] ${fn} skipped:`, e instanceof Error ? e.message : e);
          } finally {
            clearTimeout(t);
          }
        }));
      }
    }
    const { data: signalRows } = await supabase
      .from("signal_events")
      .select("signal_type, occurred_at, source, metadata")
      .eq("lead_id", leadId)
      .eq("user_id", userId)
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
          JSON.stringify({ error: AI_CREDITS_USER_MESSAGE, error_code: "ai_credits" }),
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

    // External sources are citable material like any page we read, so they
    // count toward the brief's sources and its completeness score.
    const sources = [...pages.map((p) => p.url), ...web.results.map((r) => r.url)];

    /*
     * Say when the outside half of the research did not run.
     *
     * Without PARALLEL_API_KEY, parallelConfigured() is false, web.results is
     * empty, and everything downstream still succeeds: a brief is written, it
     * is saved, and every source on it is a page off the prospect's own site.
     * That is indistinguishable, from the outside, from a lead the web simply
     * has nothing on — which is how a search ran with every source link opening
     * the lead's own website and nothing said why.
     *
     * The company's own pages say the same thing to every visitor and almost
     * never carry a date, so this is not a cosmetic gap: it is the half that
     * makes an observation datable, and the half a cold open trades on.
     */
    const externalResearch: {
      ran: boolean;
      sources: number;
      reason: string | null;
      note: string | null;
    } = {
      ran: web.error === null,
      sources: web.results.length,
      reason: web.error,
      note: web.error === "not_configured"
        ? "External web research is switched off — PARALLEL_API_KEY is not set on this project. " +
          "Briefs are being written from the prospect's own website alone, so every source link " +
          "points back at their site and nothing here is dated by an independent source."
        : web.error
          ? `External web research failed (${web.error}); this brief is from the prospect's own site alone.`
          : null,
    };
    if (externalResearch.note) console.warn(`[research-lead] ${host}: ${externalResearch.note}`);

    // Signal facts are merged in rather than asked for. They are verified
    // events with dates and citable sources, so routing them through a
    // generator could only lose or soften them — and the model has already
    // shown it will write around evidence it was given. They lead the
    // observation list because recency is what a cold open trades on.
    const modelObservations = (result.brief.observations ?? []).filter((o) => o?.fact);
    const mergedObservations = [
      // occurred_at rides along. Dropping it made a verified, dated event
      // indistinguishable from an undated line scraped off an About page —
      // and the writer is told not to date anything undated, so losing it
      // would suppress exactly the recency these events exist to provide.
      ...signalFacts.map((f) => ({
        fact: f.fact,
        source: f.source,
        occurred: normalizeOccurred(f.occurred_at ?? ""),
      })),
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
    // ─── What moved since the last look ──────────────────────────────────────
    //
    // The previous brief is already in hand — it is the row we are about to
    // overwrite — and comparing the two was never done. A difference is the
    // only material in the whole brief whose timing is certain: a standing
    // marketing page was equally true last year, but "this was not on their
    // site three weeks ago" dates itself by construction.
    //
    // The previous brief carries its own `changes` from the run before. Diffing
    // against a brief that already describes a diff would compound, so only the
    // observations are compared, which is all diffBriefs reads.
    const changes = diffBriefs(
      (lead.research_brief ?? null) as LeadResearchBrief | null,
      baseBrief,
      { previousAt: (lead.researched_at as string | null) ?? null },
    );
    if (changes) {
      console.log(
        `[research-lead] ${host}: ${changes.added.length} new, ${changes.removed.length} gone since ${
          changes.days === null ? "the last look" : `${changes.days}d ago`
        }`,
      );
    }

    // Deterministic completeness score so every surface gates the same way.
    const quality = scoreResearchQuality(baseBrief, sources);
    const brief: LeadResearchBrief = { ...baseBrief, quality, changes };
    const researchedAt = new Date().toISOString();

    const { error: writeError } = await supabase
      .from("leads")
      .update({
        research_brief: brief,
        research_sources: [...sources, ...signalFacts.map((f) => f.source)],
        research_confidence: brief.confidence,
        researched_at: researchedAt,
        // What this brief was built from, so the next freshness check can ask
        // whether the inputs changed rather than whether the row was written
        // to. Without it, the score written a moment from now invalidates the
        // work that just finished.
        research_inputs: researchInputs(lead as Record<string, string | null>),
      })
      .eq("id", leadId)
      .eq("user_id", userId);
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
        external_research: externalResearch,
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
