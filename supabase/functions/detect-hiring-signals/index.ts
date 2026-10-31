import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import {
  boardCacheExpiry,
  boardCacheKey,
  fetchKnownBoard,
  probeBoards,
  slugCandidates,
  type AtsJob,
  type BoardCacheValue,
  type DiscoveredBoard,
} from "../_shared/ats-boards.ts";

// Real, free buying signals from a company's public ATS job board.
//
// Greenhouse, Lever and Ashby all expose a company's open roles as public JSON
// with no auth and no setup on the user's side. A company hiring GTM roles
// (sales, revops, growth, marketing) is a genuine, timely buying signal for
// outbound tooling; any active hiring is a softer growth signal. We turn the
// newest relevant posting into a row in signal_events, and the existing Lead
// Score v2 engine decays it by recency and folds it into real intent. Signals
// are deduped by the newest relevant job so re-polling the same board does not
// inflate intent, and a brand-new posting fires a fresh signal.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Identify ourselves politely to the public boards.
const UA = "OutReign-Signals/1.0 (+https://outreign.io)";
const FETCH_TIMEOUT_MS = 6000;

function json(b: unknown, s = 200): Response {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function fetchJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// A GTM hire (they are building pipeline/revenue) is the strongest signal for
// outbound tooling; anything else is treated as general growth.
const GTM_RE = /\b(sales|account executive|\bae\b|sdr|bdr|revenue|rev\s?ops|go[-\s]?to[-\s]?market|\bgtm\b|demand gen|growth|marketing|partnership|business development)\b/i;

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

    const { data: lead } = await supabase
      .from("leads").select("id, company_name, company_website")
      .eq("id", leadId).eq("user_id", user.id).maybeSingle();
    if (!lead) return json({ error: "lead not found", error_code: "not_found" }, 404);

    const slugs = slugCandidates(lead.company_website, lead.company_name);
    if (!slugs.length) return json({ detected: false, reason: "no company domain or name to look up" });

    /*
     * Discovery is the expensive half, so what it found is remembered.
     *
     * Fifteen requests at a 6s timeout is up to ninety seconds to answer "no
     * public board", and that answer was recomputed from scratch on every
     * call. A known board skips straight to its own endpoint; a known miss
     * answers without touching the network at all. Both matter far more now
     * that a schedule re-polls rather than enrichment asking once.
     */
    const cacheKey = boardCacheKey(lead.company_website, lead.company_name);
    const { data: cachedRow } = await supabase
      .from("api_cache").select("cache_value, expires_at").eq("cache_key", cacheKey).maybeSingle();
    const cacheFresh = !!cachedRow?.expires_at && new Date(cachedRow.expires_at).getTime() > Date.now();
    const cached = (cacheFresh ? cachedRow!.cache_value : null) as BoardCacheValue | null;

    if (cached?.none) {
      return json({ detected: false, reason: "no public ATS board found", cached: true });
    }

    let board: DiscoveredBoard | null = null;
    let fromCache = false;
    if (cached?.provider && cached.token) {
      board = await fetchKnownBoard(cached.provider, cached.token, fetchJson);
      fromCache = !!board;
    }
    if (!board) {
      board = await probeBoards(slugs, fetchJson);
      const value: BoardCacheValue = board
        ? { provider: board.provider, token: board.token }
        : { none: true };
      await supabase.from("api_cache").upsert({
        cache_key: cacheKey,
        cache_value: value,
        expires_at: boardCacheExpiry(value),
      }, { onConflict: "cache_key" });
    }
    if (!board) return json({ detected: false, reason: "no public ATS board found" });

    // Newest relevant posting decides the signal. GTM roles are the strong
    // signal; otherwise any open roles are a softer growth signal.
    const byDateDesc = (a: AtsJob, b: AtsJob) => Date.parse(b.date) - Date.parse(a.date);
    const gtm = board.jobs.filter((j) => GTM_RE.test(j.title)).sort(byDateDesc);
    const relevant = gtm.length ? gtm : [...board.jobs].sort(byDateDesc);
    const newest = relevant[0];
    if (!newest) return json({ detected: false, reason: "board had no readable roles" });

    const isGtm = gtm.length > 0;
    const signalType = isGtm ? "hiring_gtm" : "hiring_growth";
    const weight = isGtm ? 30 : 12;
    const signalKey = `${signalType}:${board.provider}:${board.token}:${newest.id}`;

    // Dedupe: one signal per newest-relevant-posting state. Re-polls with the
    // same newest role add nothing; a new posting produces a new signal_key.
    const { data: existing } = await supabase
      .from("signal_events").select("metadata")
      .eq("lead_id", leadId).eq("user_id", user.id).ilike("source", "ats:%").limit(50);
    const already = (existing || []).some((e: any) => e?.metadata?.signal_key === signalKey);
    if (already) {
      return json({ detected: true, deduped: true, signal_type: signalType, provider: board.provider });
    }

    const roles = relevant.slice(0, 5).map((j) => j.title).filter(Boolean);
    const { error: insErr } = await supabase.from("signal_events").insert({
      lead_id: leadId,
      user_id: user.id,
      signal_type: signalType,
      weight,
      occurred_at: new Date(newest.date).toISOString(),
      source: `ats:${board.provider}`,
      metadata: {
        signal_key: signalKey,
        provider: board.provider,
        board_token: board.token,
        open_roles: board.jobs.length,
        gtm_roles: gtm.length,
        roles,
        top_role: newest.title,
        top_role_url: newest.url,
        company_name: lead.company_name,
      },
    });
    if (insErr) return json({ error: "could not record signal", error_code: "db_error" }, 500);

    return json({
      detected: true,
      signal_type: signalType,
      cached_board: fromCache,
      provider: board.provider,
      board_token: board.token,
      open_roles: board.jobs.length,
      gtm_roles: gtm.length,
      top_role: newest.title,
    });
  } catch (e) {
    console.error("[detect-hiring-signals] error:", e instanceof Error ? e.message : e);
    return json({ error: "something went wrong", error_code: "internal" }, 500);
  }
});
