import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import {
  competitorMatcher,
  extractList,
  norm,
  normalizeTech,
  recentChanges,
  toDomain,
  toStringArray,
} from "../_shared/bloomberry.ts";

// Technographic buying signals from Bloomberry (https://bloomberry.com).
//
// Bloomberry tracks which B2B products a company runs, and when they started or
// stopped running each one — including backend and enterprise software that
// leaves no website footprint, which a DOM-scraping detector can never see.
// Two distinct things come out of one lookup:
//
//   1. Fit  — the company's current stack is written to leads.technologies, so
//      the `tech` dimension of Lead Score v2 finally has something to match
//      against the user's ICP tech_stack.
//   2. Intent — a product added or dropped recently is a genuine, timestamped
//      buying event. It lands in signal_events, which fires the rescore trigger
//      and decays by recency in the existing engine, exactly like the hiring
//      and funding detectors.
//
// A move involving a *competitor* (the user's icp_profiles.exclude_tech_stack)
// is the most actionable case, so it carries a heavier weight than a generic
// change: dropping a rival is an opening, adopting one is a displacement target.
//
// Every uncached lookup costs a Bloomberry credit, so responses are cached by
// domain and demo mode never touches the provider.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "OutReign-Signals/1.0 (+https://outreign.io)";
const FETCH_TIMEOUT_MS = 10000;

// Technographics move slowly and every miss burns a credit, so cache hard.
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

// How recent a change must be to still count as intent. The engine decays on a
// 14-day half-life, so anything older than a quarter contributes ~nothing.
const LOOKBACK_DAYS = 90;

// Calibrated against the existing detectors: hiring_growth 12, hiring_gtm 30,
// funding_raised 40. A generic change sits below a GTM hire; a competitor move
// sits just above it.
const WEIGHT_GENERIC = 18;
const WEIGHT_COMPETITOR = 32;

const MAX_TECHNOLOGIES = 20;

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

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    if (!leadId) return json({ error: "leadId is required", error_code: "invalid_input" }, 400);

    // Demo mode must never spend a Bloomberry credit.
    if (await isDemoMode(supabase, user.id)) {
      return demoResponse(
        { detected: false, message: "Technographic lookup simulated in demo mode — no credits spent." },
        corsHeaders,
      );
    }

    const rl = await rateLimit(`detect-tech-signals:${user.id}`, 30, 60);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter, corsHeaders);

    // A missing key degrades to a no-op rather than failing enrichment, matching
    // how the other provider-backed functions behave.
    const apiKey = Deno.env.get("BLOOMBERRY_API_KEY");
    if (!apiKey) {
      console.error("[detect-tech-signals] BLOOMBERRY_API_KEY not configured");
      return json({ detected: false, reason: "technographic provider not configured" });
    }
    const baseUrl = Deno.env.get("BLOOMBERRY_API_URL") || "https://api.bloomberry.com";

    const { data: lead } = await supabase
      .from("leads").select("id, company_name, company_website, technologies")
      .eq("id", leadId).eq("user_id", user.id).maybeSingle();
    if (!lead) return json({ error: "lead not found", error_code: "not_found" }, 404);

    const domain = toDomain(lead.company_website);
    if (!domain) return json({ detected: false, reason: "no company domain to look up" });

    // Cache first — every miss costs a credit.
    const cacheKey = `bloomberry_tech:${domain}`;
    const { data: cached } = await supabase
      .from("api_cache").select("cache_value, expires_at").eq("cache_key", cacheKey).maybeSingle();
    const cacheHit = !!cached?.expires_at && new Date(cached.expires_at).getTime() > Date.now();
    let payload: unknown = cacheHit ? cached!.cache_value : null;

    if (!cacheHit) {
      // Bloomberry authenticates with the key as a query parameter, not a header.
      const url = `${baseUrl}/enrichments/tech.json?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(apiKey)}`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
      } catch (e) {
        console.error("[detect-tech-signals] provider request failed:", (e as Error).message);
        return json({ detected: false, reason: "technographic lookup unavailable" });
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 401 || res.status === 403) {
        console.error("[detect-tech-signals] provider rejected the API key:", res.status);
        return json({ detected: false, reason: "technographic provider not configured" });
      }
      if (res.status === 429) {
        console.error("[detect-tech-signals] provider rate limited this account");
        return json({ detected: false, reason: "technographic provider rate limited" });
      }
      if (!res.ok) {
        console.error("[detect-tech-signals] provider returned", res.status);
        return json({ detected: false, reason: "technographic lookup unavailable" });
      }

      payload = await res.json().catch(() => null);
      if (!payload) return json({ detected: false, reason: "technographic lookup returned no data" });

      // Credit usage, for cost monitoring (header documented by Bloomberry).
      const used = res.headers.get("x-num-technographics-results-month");
      if (used) console.log(`[detect-tech-signals] technographics used this period: ${used}`);

      // Log the response SHAPE only (keys, never values) so the exact field
      // names can be confirmed from function logs — see _shared/bloomberry.ts
      // for why the parser is written against alias lists.
      const sample = extractList(payload)[0];
      console.log(
        "[detect-tech-signals] envelope keys:",
        JSON.stringify(payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload) : ["<array>"]),
        "| record keys:", JSON.stringify(sample ? Object.keys(sample) : []),
      );

      await supabase.from("api_cache").upsert({
        cache_key: cacheKey,
        cache_value: payload as Record<string, unknown>,
        ttl_seconds: CACHE_TTL_SECONDS,
        expires_at: new Date(Date.now() + CACHE_TTL_SECONDS * 1000).toISOString(),
      }, { onConflict: "cache_key" });
    }

    const tech = normalizeTech(payload);
    if (!tech.length) {
      return json({ detected: false, cached: cacheHit, reason: "no technographic data for this domain" });
    }

    // --- Fit: persist the stack so the `tech` scoring dimension can match. ---
    // Merged rather than replaced: technologies is user-editable in the lead
    // detail sheet, so a re-poll must not clobber hand-entered values.
    const current = tech.filter((t) => !t.end);
    const existing = Array.isArray(lead.technologies) ? lead.technologies : [];
    const merged: string[] = [];
    const seenTech = new Set<string>();
    for (const name of [...current.map((t) => t.name), ...existing]) {
      const k = norm(name);
      if (!k || seenTech.has(k)) continue;
      seenTech.add(k);
      merged.push(name);
      if (merged.length >= MAX_TECHNOLOGIES) break;
    }
    if (merged.length) {
      await supabase.from("leads").update({ technologies: merged })
        .eq("id", leadId).eq("user_id", user.id);
      await supabase.from("enrichment_history").insert({
        lead_id: leadId,
        user_id: user.id,
        fields_enriched: ["technologies"],
        source: "bloomberry",
        status: "success",
      });
    }

    // --- Intent: the most actionable recent add/drop. ---
    const { data: icp } = await supabase
      .from("icp_profiles").select("exclude_tech_stack").eq("user_id", user.id).maybeSingle();
    const isCompetitor = competitorMatcher(toStringArray(icp?.exclude_tech_stack));

    // One signal per run. The engine adds a count bonus per event, so emitting
    // every change would inflate intent for companies that simply churn tooling.
    const changes = recentChanges(tech, LOOKBACK_DAYS, isCompetitor);
    if (!changes.length) {
      return json({
        detected: false,
        cached: cacheHit,
        reason: `no stack change in the last ${LOOKBACK_DAYS} days`,
        technologies_written: merged.length,
        current_stack: current.length,
      });
    }

    const top = changes[0];
    const competitorMove = isCompetitor(top.item.name);
    const weight = competitorMove ? WEIGHT_COMPETITOR : WEIGHT_GENERIC;
    const signalKey = `tech_stack_change:${domain}:${norm(top.item.name)}:${top.change}:${top.at.slice(0, 10)}`;

    // Dedupe on the exact change so re-polling the same stack adds nothing.
    const { data: prior } = await supabase
      .from("signal_events").select("metadata")
      .eq("lead_id", leadId).eq("user_id", user.id).ilike("source", "tech:%").limit(50);
    if ((prior || []).some((e: { metadata?: Record<string, unknown> | null }) => e?.metadata?.signal_key === signalKey)) {
      return json({
        detected: true, deduped: true, signal_type: "tech_stack_change",
        cached: cacheHit, technologies_written: merged.length,
      });
    }

    const { error: insErr } = await supabase.from("signal_events").insert({
      lead_id: leadId,
      user_id: user.id,
      // Matches the signal already declared in src/lib/outbound-kb.ts, which
      // nothing emitted until now.
      signal_type: "tech_stack_change",
      weight,
      occurred_at: top.at,
      source: "tech:bloomberry",
      metadata: {
        signal_key: signalKey,
        product: top.item.name,
        category: top.item.category,
        change: top.change,
        competitor: competitorMove,
        current_stack: current.slice(0, MAX_TECHNOLOGIES).map((t) => t.name),
        company_name: lead.company_name,
        domain,
        // research-account only renders a why-now claim when it can cite a source.
        source_url: "https://bloomberry.com/",
        source_name: "Bloomberry technographics",
      },
    });
    if (insErr) {
      console.error("[detect-tech-signals] insert failed:", insErr.message);
      return json({ error: "could not record signal", error_code: "db_error" }, 500);
    }

    return json({
      detected: true,
      signal_type: "tech_stack_change",
      change: top.change,
      product: top.item.name,
      category: top.item.category,
      competitor: competitorMove,
      weight,
      occurred_at: top.at,
      cached: cacheHit,
      technologies_written: merged.length,
      current_stack: current.length,
    });
  } catch (e) {
    console.error("[detect-tech-signals] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
