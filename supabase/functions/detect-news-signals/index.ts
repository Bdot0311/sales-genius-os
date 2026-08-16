import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { isDemoMode, demoResponse } from "../_shared/demo-mode.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { toDomain } from "../_shared/bloomberry.ts";
import { extractEvents, normalizeNewsEvents, topSignal } from "../_shared/predictleads.ts";

// Company news events from PredictLeads, as buying signals.
//
// Only this dataset is used. Their technology detections duplicate Bloomberry
// and their job openings duplicate detect-hiring-signals, which reads the same
// boards for free. News events fill a real gap: the only funding signal the
// product had was SEC Form D, which is US-only, so a European round or any
// expansion, launch or leadership change was invisible.
//
// Events land in signal_events, which fires the rescore trigger and decays by
// recency in the existing engine — same as hiring, funding and tech signals.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "OutReign-Signals/1.0 (+https://outreign.io)";
const FETCH_TIMEOUT_MS = 10000;

// News is time-sensitive but not minute-to-minute, and every miss costs a
// credit. A day collapses the repeated looks a user takes while working a list.
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const LOOKBACK_DAYS = 90;

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

    if (await isDemoMode(supabase, user.id)) {
      return demoResponse({ detected: false, message: "News signal lookup simulated in demo mode — no credits spent." }, corsHeaders);
    }

    const rl = await rateLimit(`detect-news-signals:${user.id}`, 30, 60);
    if (!rl.allowed) return rateLimitResponse(rl.retryAfter, corsHeaders);

    // PredictLeads authenticates with two headers, not one. A missing pair
    // degrades to a no-op rather than failing enrichment.
    const apiKey = Deno.env.get("PREDICTLEADS_API_KEY");
    const apiToken = Deno.env.get("PREDICTLEADS_API_TOKEN");
    if (!apiKey || !apiToken) {
      console.error("[detect-news-signals] PREDICTLEADS_API_KEY/TOKEN not configured");
      return json({ detected: false, reason: "news provider not configured" });
    }
    const baseUrl = Deno.env.get("PREDICTLEADS_API_URL") || "https://predictleads.com/api/v3";

    const { data: lead } = await supabase
      .from("leads").select("id, company_name, company_website")
      .eq("id", leadId).eq("user_id", user.id).maybeSingle();
    if (!lead) return json({ error: "lead not found", error_code: "not_found" }, 404);

    const domain = toDomain(lead.company_website);
    if (!domain) return json({ detected: false, reason: "no company domain to look up" });

    const cacheKey = `predictleads_news:${domain}`;
    const { data: cached } = await supabase
      .from("api_cache").select("cache_value, expires_at").eq("cache_key", cacheKey).maybeSingle();
    const cacheHit = !!cached?.expires_at && new Date(cached.expires_at).getTime() > Date.now();
    let payload: unknown = cacheHit ? cached!.cache_value : null;

    if (!cacheHit) {
      const url = `${baseUrl}/companies/${encodeURIComponent(domain)}/news_events?limit=50`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { "X-Api-Key": apiKey, "X-Api-Token": apiToken, "User-Agent": UA, Accept: "application/json" },
          signal: ctrl.signal,
        });
      } catch (e) {
        console.error("[detect-news-signals] provider request failed:", (e as Error).message);
        return json({ detected: false, reason: "news lookup unavailable" });
      } finally {
        clearTimeout(timer);
      }

      if (res.status === 401 || res.status === 403) {
        console.error("[detect-news-signals] provider rejected the credentials:", res.status);
        return json({ detected: false, reason: "news provider not configured" });
      }
      if (res.status === 404) return json({ detected: false, reason: "no news coverage for this domain" });
      if (res.status === 429) {
        console.error("[detect-news-signals] provider rate limited this account");
        return json({ detected: false, reason: "news provider rate limited" });
      }
      if (!res.ok) {
        console.error("[detect-news-signals] provider returned", res.status);
        return json({ detected: false, reason: "news lookup unavailable" });
      }

      payload = await res.json().catch(() => null);
      if (!payload) return json({ detected: false, reason: "news lookup returned no data" });

      // Shape only, never values — the docs host is unreachable, so this is how
      // the real field names get confirmed.
      const sample = extractEvents(payload)[0];
      console.log(
        "[detect-news-signals] envelope keys:",
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

    const events = normalizeNewsEvents(payload);
    // One signal per run. The engine adds a count bonus per event, so writing
    // every article would let a well-covered company outrank a better-fit one
    // on press alone.
    const top = topSignal(events, LOOKBACK_DAYS);
    if (!top) {
      return json({ detected: false, cached: cacheHit, reason: `no company news in the last ${LOOKBACK_DAYS} days`, events: events.length });
    }

    // detect-funding-signals already writes funding_raised from SEC Form D. The
    // same round reported by both sources would otherwise count twice, so a
    // recent one of either origin wins and this one stands down.
    if (top.signalType === "funding_raised") {
      const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
      const { data: existing } = await supabase
        .from("signal_events").select("id")
        .eq("lead_id", leadId).eq("user_id", user.id)
        .eq("signal_type", "funding_raised").gte("occurred_at", since).limit(1);
      if (existing?.length) {
        return json({ detected: true, deduped: true, signal_type: top.signalType, reason: "funding already recorded for this lead", cached: cacheHit });
      }
    }

    const signalKey = `news:${domain}:${top.category}:${(top.at ?? "").slice(0, 10)}:${(top.title ?? "").slice(0, 40)}`;
    const { data: prior } = await supabase
      .from("signal_events").select("metadata")
      .eq("lead_id", leadId).eq("user_id", user.id).ilike("source", "news:%").limit(50);
    if ((prior || []).some((e: { metadata?: Record<string, unknown> | null }) => e?.metadata?.signal_key === signalKey)) {
      return json({ detected: true, deduped: true, signal_type: top.signalType, cached: cacheHit });
    }

    const { error: insErr } = await supabase.from("signal_events").insert({
      lead_id: leadId,
      user_id: user.id,
      signal_type: top.signalType,
      weight: top.weight,
      occurred_at: top.at ?? new Date().toISOString(),
      source: "news:predictleads",
      metadata: {
        signal_key: signalKey,
        category: top.category,
        headline: top.title,
        company_name: lead.company_name,
        domain,
        // research-account renders a why-now claim only when it can cite a source.
        source_url: top.url ?? "https://predictleads.com/",
        source_name: "PredictLeads news events",
      },
    });
    if (insErr) {
      console.error("[detect-news-signals] insert failed:", insErr.message);
      return json({ error: "could not record signal", error_code: "db_error" }, 500);
    }

    return json({
      detected: true,
      signal_type: top.signalType,
      category: top.category,
      weight: top.weight,
      headline: top.title,
      occurred_at: top.at,
      events: events.length,
      cached: cacheHit,
    });
  } catch (e) {
    console.error("[detect-news-signals] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
