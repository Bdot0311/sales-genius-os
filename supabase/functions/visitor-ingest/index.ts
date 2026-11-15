import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.76.1";
import { resolveAppUser } from "../_shared/app-user.ts";
import { rateLimit, rateLimitResponse } from "../_shared/rate-limit.ts";
import { RAW_IP_TTL_MS, VISITOR_FLAG, networkPrefix, trustedClientIp } from "../_shared/visitor-identity.ts";
import { INGEST_LIMITS, planIngest, type IngestSite } from "../_shared/visitor-ingest.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > INGEST_LIMITS.maxBodyBytes) return json({ error: "Payload is too large." }, 413);

  const text = await req.text();
  if (text.length > INGEST_LIMITS.maxBodyBytes) return json({ error: "Payload is too large." }, 413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Expected JSON." }, 400);
  }

  const siteId = body && typeof body === "object" && !Array.isArray(body) && typeof (body as { site_id?: unknown }).site_id === "string"
    ? (body as { site_id: string }).site_id
    : "";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: row } = await admin.from("visitor_sites")
    .select("id, user_id, allowed_domains, consent_mode, excluded_paths, excluded_ips, enabled, verified_hosts")
    .eq("id", siteId)
    .maybeSingle();

  const { data: flag } = await admin.from("feature_flags").select("is_enabled").eq("name", VISITOR_FLAG).maybeSingle();
  const { data: grant } = row
    ? await admin.from("visitor_workspace_grants").select("enabled").eq("user_id", row.user_id).maybeSingle()
    : { data: null };

  let ownerTest = false;
  const askedTest = !!body && typeof body === "object" && (body as { test?: unknown }).test === true;
  if (askedTest && row && (req.headers.get("Authorization") || req.headers.get("X-API-Key"))) {
    const resolved = await resolveAppUser(req, admin);
    ownerTest = !!resolved.user && resolved.user.id === row.user_id;
  }

  const forwarded = req.headers.get("x-forwarded-for");
  const observed = trustedClientIp(forwarded);
  const ratePrefix = observed ? (networkPrefix(observed) ?? "private") : "none";
  const ipRl = await rateLimit(`visitor-ingest:${siteId}:${ratePrefix}`, INGEST_LIMITS.perIpPerMinute, 60);
  const siteRl = await rateLimit(`visitor-ingest:${siteId}`, INGEST_LIMITS.perSitePerMinute, 60);

  const site: IngestSite | null = row
    ? {
      id: row.id,
      userId: row.user_id,
      allowedDomains: row.allowed_domains ?? [],
      consentMode: row.consent_mode === "not_required" ? "not_required" : "required",
      excludedPaths: row.excluded_paths ?? [],
      excludedIps: row.excluded_ips ?? [],
      enabled: row.enabled !== false,
    }
    : null;

  const plan = planIngest({
    body,
    bodyBytes: text.length,
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    userAgent: req.headers.get("user-agent"),
    dnt: req.headers.get("dnt"),
    gpc: req.headers.get("sec-gpc"),
    forwardedFor: forwarded,
    site,
    flagOn: flag?.is_enabled === true,
    grantOn: grant?.enabled === true,
    ownerTest,
    ipHits: ipRl.allowed ? 0 : INGEST_LIMITS.perIpPerMinute,
    siteHits: siteRl.allowed ? 0 : INGEST_LIMITS.perSitePerMinute,
  });

  if (!plan.ok) {
    if (plan.status === 429) return rateLimitResponse(60, cors);
    if (plan.status === 204) return json(null, 204);
    return json({ error: plan.error }, plan.status);
  }

  const receivedAt = new Date().toISOString();
  const rows = plan.events.map((event) => ({
    site_id: site!.id,
    user_id: site!.userId,
    event_id: event.eventId,
    event_name: event.eventName,
    path: event.path,
    page_type: event.pageType,
    referrer_host: event.referrerHost,
    utm: event.utm,
    props: event.props,
    session_id: event.sessionId,
    visitor_key: event.visitorKey,
    is_returning: event.returning,
    engagement: event.engagement,
    is_test: event.test,
    received_at: receivedAt,
  }));

  let accepted = 0;
  let duplicate = 0;
  const inserted = await admin.from("visitor_events").insert(rows).select("event_id");
  if (inserted.error?.code === "23505") {
    for (const row of rows) {
      const one = await admin.from("visitor_events").insert(row).select("event_id");
      if (one.error?.code === "23505") duplicate += 1;
      else if (!one.error) accepted += 1;
    }
  } else if (inserted.error) {
    console.error("[visitor-ingest] insert failed", inserted.error.message);
    return json({ error: "Could not store events." }, 500);
  } else {
    accepted = inserted.data?.length ?? rows.length;
  }

  if (plan.ip && accepted > 0) {
    const ipHash = await hashIp(plan.ip);
    const until = new Date(Date.now() + RAW_IP_TTL_MS).toISOString();
    const visitorKey = plan.events[0].visitorKey;
    const existing = await admin.from("visitor_resolve_jobs")
      .select("id, status")
      .eq("site_id", site!.id)
      .eq("ip_hash", ipHash)
      .maybeSingle();
    if (!existing.data) {
      await admin.from("visitor_resolve_jobs").insert({
        site_id: site!.id,
        user_id: site!.userId,
        visitor_key: visitorKey,
        ip_hash: ipHash,
        ip_raw: plan.ip,
        ip_raw_until: until,
        network_prefix: plan.prefix ?? networkPrefix(plan.ip),
        status: "queued",
      });
    } else if (existing.data.status === "done" || existing.data.status === "failed") {
      await admin.from("visitor_resolve_jobs").update({
        status: "queued",
        visitor_key: visitorKey,
        ip_raw: plan.ip,
        ip_raw_until: until,
        network_prefix: plan.prefix ?? networkPrefix(plan.ip),
        attempts: 0,
        last_error: null,
        available_at: receivedAt,
        finished_at: null,
      }).eq("id", existing.data.id);
    }
  }

  if (!ownerTest && accepted > 0) {
    const host = (req.headers.get("origin") || req.headers.get("referer") || "");
    let hostname = "";
    try { hostname = new URL(host).hostname.toLowerCase(); } catch { hostname = ""; }
    if (hostname && !(row?.verified_hosts ?? []).includes(hostname)) {
      await admin.from("visitor_sites").update({
        verified_hosts: [...(row?.verified_hosts ?? []), hostname],
      }).eq("id", site!.id);
    }
  }

  return json({ accepted, duplicate });
});

async function hashIp(ip: string): Promise<string> {
  const pepper = Deno.env.get("VISITOR_IP_PEPPER") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "visitor";
  const bytes = new TextEncoder().encode(`visitor-v1:${pepper}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}
