// Scheduled SEO audit.
// mode: 'perf' (PageSpeed Lighthouse) | 'crawl' (sitemap + GSC) | 'both'
// Triggered by pg_cron. Diffs against open issues, marks resolved ones,
// pushes web-push to admins on new issues.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SITE = "https://salesos.alephwavex.io";
const SITEMAP_URL = `${SITE}/sitemap.xml`;
const VAPID_PUBLIC = "BLnZWkSds4tox8rY3fVPQ5ZJ5VQGKjBpJS3tsWp_wTASDBIvLmr_zWkkbKKygDz64EFAPT-uY0uoql7v5_KqVb8";

// Lighthouse thresholds — issue raised when score drops below
const PERF_MIN = 0.7;
const SEO_MIN = 0.9;
const A11Y_MIN = 0.9;

type Issue = {
  fingerprint: string;
  category: "crawl_error" | "schema" | "performance" | "accessibility" | "seo" | "sitemap";
  severity: "low" | "mid" | "high" | "critical";
  url?: string;
  title: string;
  description?: string;
  details?: Record<string, unknown>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function fetchSitemapUrls(): Promise<string[]> {
  try {
    const res = await fetch(SITEMAP_URL);
    if (!res.ok) return [];
    const xml = await res.text();
    return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
  } catch {
    return [];
  }
}

async function runPageSpeed(url: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const api = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance&category=seo&category=accessibility&strategy=mobile`;
  try {
    const res = await fetch(api);
    if (!res.ok) return issues;
    const data = await res.json();
    const cats = data?.lighthouseResult?.categories || {};
    const checks: Array<[string, "performance" | "accessibility" | "seo", number, "low" | "mid" | "high"]> = [
      ["performance", "performance", PERF_MIN, "mid"],
      ["accessibility", "accessibility", A11Y_MIN, "mid"],
      ["seo", "seo", SEO_MIN, "high"],
    ];
    for (const [key, category, threshold, severity] of checks) {
      const score = cats[key]?.score;
      if (typeof score === "number" && score < threshold) {
        issues.push({
          fingerprint: `lighthouse:${category}:${url}`,
          category,
          severity,
          url,
          title: `${cats[key].title || key} score dropped to ${(score * 100).toFixed(0)}`,
          description: `Below threshold (${(threshold * 100).toFixed(0)}). Investigate ${cats[key].title || key} on ${url}.`,
          details: { score, threshold, strategy: "mobile" },
        });
      }
    }
  } catch (e) {
    console.warn("PageSpeed failed for", url, e);
  }
  return issues;
}

async function crawlPage(url: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "OutReign-SEO-Monitor/1.0" } });
    if (res.status >= 400) {
      issues.push({
        fingerprint: `crawl:${res.status}:${url}`,
        category: "crawl_error",
        severity: res.status >= 500 ? "critical" : "high",
        url,
        title: `HTTP ${res.status} on ${new URL(url).pathname}`,
        description: `Crawler received status ${res.status} for ${url}.`,
        details: { status: res.status },
      });
      return issues;
    }
    const html = await res.text();

    // Schema: must contain at least one JSON-LD block on homepage / important pages
    const hasJsonLd = /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(html);
    if (!hasJsonLd) {
      issues.push({
        fingerprint: `schema:missing_jsonld:${url}`,
        category: "schema",
        severity: "mid",
        url,
        title: `Missing structured data on ${new URL(url).pathname}`,
        description: "No JSON-LD script tag found. Search engines may miss rich-result eligibility.",
      });
    } else {
      // Validate every JSON-LD block parses
      const blocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
      for (let i = 0; i < blocks.length; i++) {
        try {
          JSON.parse(blocks[i][1].trim());
        } catch {
          issues.push({
            fingerprint: `schema:invalid_jsonld:${url}:${i}`,
            category: "schema",
            severity: "high",
            url,
            title: `Invalid JSON-LD on ${new URL(url).pathname}`,
            description: `JSON-LD block #${i + 1} failed to parse.`,
          });
        }
      }
    }

    // Title + meta description
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (!titleMatch || titleMatch[1].trim().length < 10) {
      issues.push({
        fingerprint: `seo:missing_title:${url}`,
        category: "seo",
        severity: "high",
        url,
        title: `Missing or short <title> on ${new URL(url).pathname}`,
        description: "Page lacks a descriptive title tag.",
      });
    }
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    if (!descMatch || descMatch[1].trim().length < 50) {
      issues.push({
        fingerprint: `seo:missing_description:${url}`,
        category: "seo",
        severity: "mid",
        url,
        title: `Missing or short meta description on ${new URL(url).pathname}`,
      });
    }
  } catch (e) {
    issues.push({
      fingerprint: `crawl:network:${url}`,
      category: "crawl_error",
      severity: "high",
      url,
      title: `Network error fetching ${new URL(url).pathname}`,
      description: String(e),
    });
  }
  return issues;
}

async function fetchGscErrors(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
  const GSC = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
  if (!LOVABLE || !GSC) return issues;

  try {
    const siteEncoded = encodeURIComponent(`${SITE}/`);
    // Use Search Analytics to find pages with low impressions/crawl issues over last 7 days
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `https://connector-gateway.lovable.dev/google_search_console/webmasters/v3/sites/${siteEncoded}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE}`,
          "X-Connection-Api-Key": GSC,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: since,
          endDate: until,
          dimensions: ["page"],
          rowLimit: 25,
        }),
      },
    );
    if (!res.ok) {
      console.warn("GSC query failed:", res.status, await res.text().catch(() => ""));
      return issues;
    }
    const data = await res.json();
    const rows = data?.rows || [];
    // Pages with zero clicks AND below median impressions = likely crawl/indexing issue
    if (rows.length > 0) {
      const totalImpressions = rows.reduce((s: number, r: { impressions: number }) => s + (r.impressions || 0), 0);
      const median = totalImpressions / rows.length;
      for (const r of rows) {
        if ((r.clicks || 0) === 0 && (r.impressions || 0) < median * 0.1) {
          const page = r.keys?.[0];
          if (!page) continue;
          issues.push({
            fingerprint: `gsc:low_visibility:${page}`,
            category: "seo",
            severity: "low",
            url: page,
            title: `Low search visibility for ${new URL(page).pathname}`,
            description: `Page received ${r.impressions || 0} impressions and 0 clicks over the last 7 days.`,
            details: { impressions: r.impressions, position: r.position },
          });
        }
      }
    }
  } catch (e) {
    console.warn("GSC fetch failed:", e);
  }
  return issues;
}

async function notifyAdmins(supabase: ReturnType<typeof createClient>, newIssues: Issue[]) {
  if (newIssues.length === 0) return;
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:support@bdotindustries.com";
  if (!VAPID_PRIVATE) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
  const adminIds = (admins || []).map((a: { user_id: string }) => a.user_id);
  if (adminIds.length === 0) return;

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id")
    .in("user_id", adminIds);

  const top = newIssues.slice(0, 3).map((i) => i.title).join(" · ");
  const payload = JSON.stringify({
    title: `${newIssues.length} new SEO issue${newIssues.length === 1 ? "" : "s"}`,
    body: top,
    url: "/admin/analytics?tab=seo",
    tag: "seo-monitor",
  });

  await Promise.all(
    (subs || []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (e) {
        console.warn("push failed:", e);
      }
    }),
  );

  // Mark notified
  const fingerprints = newIssues.map((i) => i.fingerprint);
  await supabase.from("seo_issues").update({ notified_at: new Date().toISOString() }).in("fingerprint", fingerprints);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  let mode: "perf" | "crawl" | "both" = "both";
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.mode === "perf" || body?.mode === "crawl" || body?.mode === "both") mode = body.mode;
  } catch { /* ignore */ }

  const kind = mode === "perf" ? "perf" : "crawl";
  const { data: runRow, error: runErr } = await supabase
    .from("seo_audit_runs")
    .insert({ kind, status: "running" })
    .select("id")
    .single();
  if (runErr || !runRow) return json({ success: false, error: runErr?.message || "run insert failed" });
  const runId = runRow.id;

  const allIssues: Issue[] = [];
  let pagesChecked = 0;
  let runStatus: "success" | "partial" | "failed" = "success";
  let errMsg: string | null = null;

  try {
    const urls = await fetchSitemapUrls();
    // Always include homepage
    if (!urls.includes(`${SITE}/`)) urls.unshift(`${SITE}/`);

    if (mode === "perf" || mode === "both") {
      // Limit PageSpeed to homepage + top 4 pages to stay under quota
      const perfUrls = urls.slice(0, 5);
      for (const u of perfUrls) {
        const issues = await runPageSpeed(u);
        allIssues.push(...issues);
        pagesChecked++;
      }
    }

    if (mode === "crawl" || mode === "both") {
      // Crawl up to 25 sitemap urls
      const crawlUrls = urls.slice(0, 25);
      const results = await Promise.all(crawlUrls.map(crawlPage));
      results.forEach((r) => allIssues.push(...r));
      pagesChecked += crawlUrls.length;

      const gscIssues = await fetchGscErrors();
      allIssues.push(...gscIssues);
    }
  } catch (e) {
    runStatus = "failed";
    errMsg = String(e);
  }

  // Upsert issues
  const now = new Date().toISOString();
  const newFingerprints: string[] = [];
  if (allIssues.length > 0) {
    const { data: existing } = await supabase
      .from("seo_issues")
      .select("fingerprint, resolved_at")
      .in("fingerprint", allIssues.map((i) => i.fingerprint));
    const existingSet = new Set((existing || []).map((e: { fingerprint: string }) => e.fingerprint));

    for (const issue of allIssues) {
      if (!existingSet.has(issue.fingerprint)) newFingerprints.push(issue.fingerprint);
    }

    // Upsert all current issues
    await supabase.from("seo_issues").upsert(
      allIssues.map((i) => ({
        fingerprint: i.fingerprint,
        category: i.category,
        severity: i.severity,
        url: i.url,
        title: i.title,
        description: i.description,
        details: i.details || {},
        last_seen_at: now,
        last_run_id: runId,
        resolved_at: null, // re-open if previously resolved
      })),
      { onConflict: "fingerprint" },
    );
  }

  // Resolve issues that didn't reappear in this run for the same kind
  const currentCategories = mode === "perf"
    ? ["performance", "accessibility", "seo"]
    : mode === "crawl"
    ? ["crawl_error", "schema", "sitemap", "seo"]
    : ["performance", "accessibility", "seo", "crawl_error", "schema", "sitemap"];

  const seenFingerprints = allIssues.map((i) => i.fingerprint);
  const { data: resolvedRows } = await supabase
    .from("seo_issues")
    .update({ resolved_at: now })
    .is("resolved_at", null)
    .in("category", currentCategories)
    .not("fingerprint", "in", `(${seenFingerprints.length > 0 ? seenFingerprints.map((f) => `"${f.replace(/"/g, '\\"')}"`).join(",") : '""'})`)
    .select("id");

  const resolvedCount = resolvedRows?.length || 0;

  // Notify
  if (newFingerprints.length > 0) {
    const newIssuesPayload = allIssues.filter((i) => newFingerprints.includes(i.fingerprint));
    await notifyAdmins(supabase, newIssuesPayload);
  }

  await supabase.from("seo_audit_runs").update({
    status: runStatus,
    finished_at: now,
    pages_checked: pagesChecked,
    issues_found: allIssues.length,
    new_issues: newFingerprints.length,
    resolved_issues: resolvedCount,
    error: errMsg,
    summary: {
      mode,
      by_category: allIssues.reduce((acc: Record<string, number>, i) => {
        acc[i.category] = (acc[i.category] || 0) + 1;
        return acc;
      }, {}),
    },
  }).eq("id", runId);

  return json({
    success: true,
    run_id: runId,
    mode,
    pages_checked: pagesChecked,
    issues_found: allIssues.length,
    new_issues: newFingerprints.length,
    resolved_issues: resolvedCount,
  });
});
