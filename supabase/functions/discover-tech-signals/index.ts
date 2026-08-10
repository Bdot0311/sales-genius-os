import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import {
  extractList,
  norm,
  normalizeCompanySignals,
  toStringArray,
} from "../_shared/bloomberry.ts";

// Account discovery from Bloomberry's /signals/tech.json.
//
// The inverse of detect-tech-signals. That one enriches a lead you already have
// (domain in, stack out). This one finds accounts you do not have yet: given a
// vendor or category, it returns the companies that started or stopped running
// it, newest first.
//
// The motion this exists for is displacement. "Who dropped a competitor in the
// last 30 days" is the warmest outbound list there is, so when no vendor is
// given the user's own icp_profiles.exclude_tech_stack (the tools they displace)
// supplies the default.
//
// Results are candidates, not leads. Nothing is written to leads, companies or
// signal_events here — importing an account is an explicit user action, because
// creating records costs the user search credits and clutters their pipeline
// with companies they never asked for.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "OutReign-Signals/1.0 (+https://outreign.io)";
const FETCH_TIMEOUT_MS = 12000;

// Shorter than the 7-day enrichment cache: the whole value here is recency.
// Half a day still collapses the repeated looks a user takes while working a list.
const CACHE_TTL_SECONDS = 12 * 60 * 60;

const DEFAULT_DAYS = 30;
const MAX_DAYS = 180;
// Bloomberry meters technographics by results returned (see the
// x-num-technographics-results-month header), so the page size is a direct
// cost lever and is capped rather than passed through from the client.
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function json(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const clampInt = (v: unknown, dflt: number, min: number, max: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: userErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !user) return json({ error: "Invalid user token" }, 401);

    if (await isDemoMode(supabase, user.id)) {
      return demoResponse({ signals: [], message: "Tech signal discovery simulated in demo mode — no credits spent." }, corsHeaders);
    }

    const rl = await rateLimit(`discover-tech-signals:${user.id}`, 20, 60);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter, corsHeaders);

    const apiKey = Deno.env.get("BLOOMBERRY_API_KEY");
    if (!apiKey) {
      console.error("[discover-tech-signals] BLOOMBERRY_API_KEY not configured");
      return json({ signals: [], reason: "technographic provider not configured" });
    }
    const baseUrl = Deno.env.get("BLOOMBERRY_API_URL") || "https://api.bloomberry.com";

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const category = typeof body.category === "string" ? body.category.trim() : "";
    let vendor = typeof body.vendor === "string" ? body.vendor.trim() : "";
    const wantChange = body.change === "added" || body.change === "removed" ? body.change : null;
    const days = clampInt(body.days, DEFAULT_DAYS, 1, MAX_DAYS);
    const limit = clampInt(body.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);

    // No target given: fall back to the tools this user displaces.
    let vendorSource = "request";
    if (!vendor && !category) {
      // icp_profiles has no unique constraint on user_id, so a user can hold
      // several. maybeSingle() errors outright when it gets more than one, which
      // silently read as "no competitors set" — take the newest, matching how
      // score-lead-v2 and process-rescore-queue already resolve the same table.
      const { data: icp } = await supabase
        .from("icp_profiles").select("exclude_tech_stack")
        .eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const competitors = toStringArray(icp?.exclude_tech_stack);
      if (!competitors.length) {
        // 200, not 400: this is a user-correctable setup gap, not a failure, and
        // every other soft stop in this function answers the same way. A 4xx here
        // reached the client as an opaque FunctionsHttpError and surfaced as
        // "could not load tech signals", hiding the one thing worth saying.
        return json({
          signals: [],
          reason: "enter a tool to search, or add competitor tools to your ICP to search them automatically",
          error_code: "no_target",
        });
      }
      vendor = competitors[0];
      vendorSource = "icp_exclude_tech_stack";
    }

    const target = vendor || category;
    const cacheKey = `bloomberry_signals:${norm(vendor)}:${norm(category)}:${days}`;
    const { data: cached } = await supabase
      .from("api_cache").select("cache_value, expires_at").eq("cache_key", cacheKey).maybeSingle();
    const cacheHit = !!cached?.expires_at && new Date(cached.expires_at).getTime() > Date.now();
    let payload: unknown = cacheHit ? cached!.cache_value : null;

    if (!cacheHit) {
      // Auth is a query parameter, not a header. days/limit are sent as hints
      // only — the real filtering happens below on the parsed records, so a
      // parameter name the provider does not recognise cannot silently widen
      // the result set beyond what the caller asked for.
      const qs = new URLSearchParams({ api_key: apiKey, days: String(days), limit: String(limit) });
      if (vendor) qs.set("vendor", vendor);
      if (category) qs.set("category", category);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/signals/tech.json?${qs}`, {
          headers: { "User-Agent": UA, Accept: "application/json" },
          signal: ctrl.signal,
        });
      } catch (e) {
        console.error("[discover-tech-signals] provider request failed:", (e as Error).message);
        return json({ signals: [], reason: "technographic lookup unavailable" });
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 401 || res.status === 403) {
        console.error("[discover-tech-signals] provider rejected the API key:", res.status);
        return json({ signals: [], reason: "technographic provider not configured" });
      }
      if (res.status === 429) {
        console.error("[discover-tech-signals] provider rate limited this account");
        return json({ signals: [], reason: "technographic provider rate limited" });
      }
      if (!res.ok) {
        console.error("[discover-tech-signals] provider returned", res.status);
        return json({ signals: [], reason: "technographic lookup unavailable" });
      }

      payload = await res.json().catch(() => null);
      if (!payload) return json({ signals: [], reason: "technographic lookup returned no data" });

      const used = res.headers.get("x-num-technographics-results-month");
      if (used) console.log(`[discover-tech-signals] technographics used this period: ${used}`);

      // Shape only, never values — lets the exact field names be confirmed from
      // logs while the provider's docs are unreachable.
      const sample = extractList(payload)[0];
      console.log(
        "[discover-tech-signals] envelope keys:",
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

    // Filter locally so the window and page size hold regardless of which
    // query parameters the provider actually honoured.
    const cutoff = Date.now() - days * 86_400_000;
    let signals = normalizeCompanySignals(payload)
      .filter((s) => !wantChange || s.change === wantChange)
      .filter((s) => !s.at || Date.parse(s.at) >= cutoff);
    const totalMatched = signals.length;
    signals = signals.slice(0, limit);

    // Flag accounts the user already tracks, so a discovery list reads as new
    // logos rather than a mix they have to cross-check by hand.
    const domains = signals.map((s) => s.domain).filter((d): d is string => !!d);
    const known = new Set<string>();
    if (domains.length) {
      const [{ data: companies }, { data: leads }] = await Promise.all([
        supabase.from("companies").select("domain").eq("user_id", user.id).in("domain", domains),
        supabase.from("leads").select("company_website").eq("user_id", user.id).limit(2000),
      ]);
      for (const c of companies || []) if (c.domain) known.add(norm(c.domain));
      for (const l of leads || []) {
        const d = norm(l.company_website).replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
        if (d) known.add(d);
      }
    }

    return json({
      signals: signals.map((s) => ({ ...s, known: !!s.domain && known.has(norm(s.domain)) })),
      target,
      vendor: vendor || null,
      category: category || null,
      vendor_source: vendorSource,
      change: wantChange,
      days,
      limit,
      total_matched: totalMatched,
      truncated: totalMatched > signals.length,
      cached: cacheHit,
    });
  } catch (e) {
    console.error("[discover-tech-signals] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
