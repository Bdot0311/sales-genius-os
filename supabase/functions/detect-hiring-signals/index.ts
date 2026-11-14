import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.0";
import { hireRelevance } from "../_shared/hire-relevance.ts";
import { ownerOf, resolveCaller } from "../_shared/internal-auth.ts";
import {
  boardCacheExpiry,
  boardCacheKey,
  fetchKnownBoard,
  probeBoards,
  slugCandidates,
  type AtsJob,
  hiringVelocity,
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    /*
     * Both a signed-in user and an internal job can ask.
     *
     * This called `auth.getUser()` on whatever token arrived, and a service
     * key is not a user — so a scheduled refresh would have got 401 on every
     * lead, which is the exact failure `resolveCaller` was written for after
     * it happened to the generate-email queue.
     *
     * An internal caller comes back with `userId: null` and does NOT say whose
     * lead it is acting on. `ownerOf` reads that off the row, so the only
     * thing a request chooses is which lead, and the database decides whose it
     * is. A forged user_id in the body cannot work because no body is read for
     * one.
     */
    const caller = await resolveCaller(req);
    if (!caller.ok) return caller.response;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    if (!leadId) return json({ error: "leadId is required", error_code: "invalid_input" }, 400);

    const ownerId = await ownerOf(supabase, "leads", leadId, caller);
    if (!ownerId) return json({ error: "lead not found", error_code: "not_found" }, 404);

    const { data: lead } = await supabase
      .from("leads").select("id, company_name, company_website")
      .eq("id", leadId).eq("user_id", ownerId).maybeSingle();
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

    /*
     * What counts as a relevant hire is the seller's question, not ours.
     *
     * Ordered, because a user with several ICP profiles would otherwise get
     * whichever row the database happened to return — and relevance decides
     * the signal_type, which is embedded in the dedupe key. A profile that
     * varied between polls would re-signal the same job board every time.
     */
    const { data: icp } = await supabase
      .from("icp_profiles")
      .select("hiring_signals, target_titles")
      .eq("user_id", ownerId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const relevance = hireRelevance(icp);

    // Newest relevant posting decides the signal. A hire the seller cares
    // about is the strong signal; otherwise any open roles are a softer
    // growth signal.
    const byDateDesc = (a: AtsJob, b: AtsJob) => Date.parse(b.date) - Date.parse(a.date);
    const gtm = board.jobs.filter((j) => relevance.isRelevant(j.title)).sort(byDateDesc);
    const relevant = gtm.length ? gtm : [...board.jobs].sort(byDateDesc);
    const newest = relevant[0];
    if (!newest) return json({ detected: false, reason: "board had no readable roles" });

    /*
     * Three strengths, not two.
     *
     * "They are hiring" and "they are hiring hard" are different things to
     * open an email on, and only the first was ever sent: one newest posting
     * decided the whole event, so a company with a single stale opening and
     * one that posted six roles this month produced the same signal.
     *
     * A surge is counted on the relevant roles, so four new engineering posts
     * are a surge for somebody who sells to engineering leaders and four new
     * GTM posts are a surge for somebody who sells to revenue leaders.
     *
     * Exactly one signal per poll. `toSignalFacts` keeps one fact per
     * signal_type, so emitting a surge alongside a plain hiring event would
     * put two sentences about the same job board into one email — the
     * "reads like a dossier" failure that module is explicit about avoiding.
     */
    /*
     * `hiring_gtm` keeps its name though it now means "a hire this seller
     * cares about" rather than specifically go-to-market. The string is
     * load-bearing: three files calibrate weights against it, the dedupe keys
     * embed it, and every row already stored uses it. Renaming it would orphan
     * that history to fix a comment.
     */
    const isGtm = gtm.length > 0;
    const velocity = hiringVelocity(relevant);
    const signalType = velocity.surge ? "hiring_surge" : isGtm ? "hiring_gtm" : "hiring_growth";
    // Sits above a single GTM hire (30) and below a funding round (40): more
    // roles is better evidence of a build-out than one posting, and still
    // weaker evidence of budget than money actually raised.
    const weight = velocity.surge ? 36 : isGtm ? 30 : 12;
    const signalKey = `${signalType}:${board.provider}:${board.token}:${newest.id}`;

    // Dedupe: one signal per newest-relevant-posting state. Re-polls with the
    // same newest role add nothing; a new posting produces a new signal_key.
    const { data: existing } = await supabase
      .from("signal_events").select("metadata")
      .eq("lead_id", leadId).eq("user_id", ownerId).ilike("source", "ats:%").limit(50);
    const already = (existing || []).some((e: any) => e?.metadata?.signal_key === signalKey);
    if (already) {
      return json({ detected: true, deduped: true, signal_type: signalType, provider: board.provider });
    }

    const roles = relevant.slice(0, 5).map((j) => j.title).filter(Boolean);
    const { error: insErr } = await supabase.from("signal_events").insert({
      lead_id: leadId,
      user_id: ownerId,
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
        recent_roles: velocity.recent,
        window_days: velocity.windowDays,
        relevance_source: relevance.source,
        relevance_basis: relevance.describe(),
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
      recent_roles: velocity.recent,
      surge: velocity.surge,
      relevance_source: relevance.source,
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
