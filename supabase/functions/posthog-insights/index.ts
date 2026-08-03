// Admin-only PostHog read API.
//
// Uses HogQL through PostHog's query endpoint. Requires a PostHog *personal*
// API key (phx_...) — the connector only provides the ingest/project token,
// which cannot read data.
//
//   POSTHOG_PERSONAL_API_KEY — read-scoped personal API key
//   POSTHOG_PROJECT_ID       — numeric project id (from the connector)
//   POSTHOG_REGION           — "eu" | "us" (from the connector)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const REGION = (Deno.env.get("POSTHOG_REGION") || "eu").toLowerCase();
const API_HOST = REGION === "us" ? "https://us.posthog.com" : "https://eu.posthog.com";
const APP_HOST = API_HOST;
const PROJECT_ID = Deno.env.get("POSTHOG_PROJECT_ID");
const PERSONAL_KEY = Deno.env.get("POSTHOG_PERSONAL_API_KEY");

const RANGES: Record<string, { days: number; interval: string }> = {
  "24h": { days: 1, interval: "hour" },
  "7d": { days: 7, interval: "day" },
  "30d": { days: 30, interval: "day" },
};

type Row = (string | number | null)[];

async function hogql(query: string): Promise<Row[]> {
  const res = await fetch(`${API_HOST}/api/projects/${PROJECT_ID}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PERSONAL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[${res.status}] ${body}`);
  }
  const data = await res.json();
  return (data?.results ?? []) as Row[];
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // --- Admin gate -------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Not authenticated" }, 401);

    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (roleError) return json({ error: "Role check failed" }, 500);
    if (isAdmin !== true) return json({ error: "Admin access required" }, 403);

    // --- Config check -----------------------------------------------------
    if (!PROJECT_ID) {
      return json({ configured: false, reason: "missing_project_id" });
    }
    if (!PERSONAL_KEY) {
      return json({ configured: false, reason: "missing_personal_api_key" });
    }

    // --- Input ------------------------------------------------------------
    const url = new URL(req.url);
    let range = url.searchParams.get("range") ?? "7d";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (typeof body?.range === "string") range = body.range;
      } catch { /* no body */ }
    }
    if (!RANGES[range]) return json({ error: "range must be one of 24h, 7d, 30d" }, 400);
    const { days, interval } = RANGES[range];

    // --- Cache ------------------------------------------------------------
    const cacheKey = `posthog_insights_${range}`;
    const { data: cached } = await supabase
      .from("api_cache")
      .select("cache_value, expires_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached?.expires_at && new Date(cached.expires_at).getTime() > Date.now()) {
      return json({ ...(cached.cache_value as Record<string, unknown>), cached: true });
    }

    const since = `now() - INTERVAL ${days} DAY`;

    // --- Queries ----------------------------------------------------------
    const [totals, trendRows, pageRows, referrerRows, funnelRows, eventRows] = await Promise.all([
      hogql(`
        SELECT
          count() AS pageviews,
          count(DISTINCT person_id) AS visitors,
          count(DISTINCT $session_id) AS sessions
        FROM events
        WHERE event = '$pageview' AND timestamp > ${since}
      `),
      hogql(`
        SELECT
          toStartOf${interval === "hour" ? "Hour" : "Day"}(timestamp) AS bucket,
          count(DISTINCT person_id) AS visitors,
          count() AS pageviews
        FROM events
        WHERE event = '$pageview' AND timestamp > ${since}
        GROUP BY bucket ORDER BY bucket
      `),
      hogql(`
        SELECT properties.$pathname AS path, count() AS views, count(DISTINCT person_id) AS visitors
        FROM events
        WHERE event = '$pageview' AND timestamp > ${since}
        GROUP BY path ORDER BY views DESC LIMIT 12
      `),
      hogql(`
        SELECT coalesce(nullIf(properties.$referring_domain, ''), '(direct)') AS referrer,
               count(DISTINCT person_id) AS visitors
        FROM events
        WHERE event = '$pageview' AND timestamp > ${since}
        GROUP BY referrer ORDER BY visitors DESC LIMIT 12
      `),
      hogql(`
        SELECT event, count(DISTINCT person_id) AS people
        FROM events
        WHERE timestamp > ${since}
          AND event IN ('signup_created','signup_completed','first_search_run','lead_search_completed',
                        'first_email_generated','first_sequence_sent','billing_checkout_session_completed')
        GROUP BY event
      `),
      hogql(`
        SELECT event, count() AS total
        FROM events
        WHERE timestamp > ${since} AND event NOT LIKE '$%'
        GROUP BY event ORDER BY total DESC LIMIT 20
      `),
    ]);

    // Bounce rate + session duration: one row per session.
    const sessionRows = await hogql(`
      SELECT
        countIf(views = 1) AS bounced,
        count() AS sessions,
        avg(duration) AS avg_duration
      FROM (
        SELECT $session_id AS sid,
               count() AS views,
               dateDiff('second', min(timestamp), max(timestamp)) AS duration
        FROM events
        WHERE event = '$pageview' AND timestamp > ${since} AND $session_id IS NOT NULL
        GROUP BY sid
      )
    `);

    const t = totals[0] ?? [];
    const s = sessionRows[0] ?? [];
    const sessions = num(s[1]);
    const funnelMap: Record<string, number> = {};
    for (const r of funnelRows) funnelMap[String(r[0])] = num(r[1]);

    const payload = {
      configured: true,
      range,
      generated_at: new Date().toISOString(),
      posthog_url: `${APP_HOST}/project/${PROJECT_ID}`,
      replays_url: `${APP_HOST}/project/${PROJECT_ID}/replay/recent`,
      totals: {
        pageviews: num(t[0]),
        visitors: num(t[1]),
        sessions: num(t[2]),
        bounce_rate: sessions > 0 ? Math.round((num(s[0]) / sessions) * 1000) / 10 : 0,
        avg_session_seconds: Math.round(num(s[2])),
      },
      trend: trendRows.map((r) => ({
        bucket: String(r[0]),
        visitors: num(r[1]),
        pageviews: num(r[2]),
      })),
      top_pages: pageRows.map((r) => ({
        path: String(r[0] ?? "(unknown)"),
        views: num(r[1]),
        visitors: num(r[2]),
      })),
      top_referrers: referrerRows.map((r) => ({
        referrer: String(r[0] ?? "(direct)"),
        visitors: num(r[1]),
      })),
      funnel: [
        { step: "Signups", people: funnelMap["signup_created"] ?? funnelMap["signup_completed"] ?? 0 },
        { step: "First search", people: funnelMap["first_search_run"] ?? funnelMap["lead_search_completed"] ?? 0 },
        { step: "First email drafted", people: funnelMap["first_email_generated"] ?? 0 },
        { step: "Sequence launched", people: funnelMap["first_sequence_sent"] ?? 0 },
        { step: "Paid", people: funnelMap["billing_checkout_session_completed"] ?? 0 },
      ],
      top_events: eventRows.map((r) => ({ event: String(r[0]), total: num(r[1]) })),
    };

    // 5-minute cache keeps us far inside PostHog's rate limits.
    await supabase.from("api_cache").upsert({
      cache_key: cacheKey,
      cache_value: payload,
      ttl_seconds: 300,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }, { onConflict: "cache_key" });

    return json(payload);
  } catch (e) {
    console.error("posthog-insights error", e);
    return json({ error: "PostHog query failed", details: String(e) }, 200);
  }
});
