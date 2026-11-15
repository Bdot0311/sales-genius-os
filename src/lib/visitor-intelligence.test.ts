import { readFileSync } from "node:fs";
import { runOutboundTool } from "../../supabase/functions/_shared/agent-outbound-tools.ts";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { planRuleRun, RULE_DAILY_CAP_MAX, WORKSPACE_DAILY_CAP } from "../../supabase/functions/_shared/visitor-automation.ts";
import { INGEST_LIMITS, ingestIpRateKey, planIngest, rateLimited, type IngestPlan, type IngestSite } from "../../supabase/functions/_shared/visitor-ingest.ts";
import {
  decideIdentity,
  featureEnabled,
  isBotUserAgent,
  networkPrefix,
  orgAgreesWithDomain,
  pageTypeFromPath,
  parseAsnTxt,
  parseRdap,
  sanitizeTrackingUrl,
  trustedClientIp,
  visitFacts,
} from "../../supabase/functions/_shared/visitor-identity.ts";
import { VISITOR_SDK_SOURCE } from "../../supabase/functions/_shared/visitor-sdk.ts";
import {
  RESOLVE_CLAIM_LIMIT,
  RESOLVE_CONCURRENCY,
  RESOLVE_WALL_BUDGET_MS,
  releaseQueuedClaim,
  runResolveBatch,
} from "../../supabase/functions/_shared/visitor-resolve-batch.ts";

const SITE: IngestSite = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  allowedDomains: ["acme.test"],
  consentMode: "required",
  excludedPaths: ["/checkout"],
  excludedIps: ["203.0.113.0/24"],
  enabled: true,
};

const base = {
  bodyBytes: 100,
  origin: "https://www.acme.test",
  referer: null,
  userAgent: "Mozilla/5.0",
  dnt: null,
  gpc: null,
  forwardedFor: "198.51.100.8",
  site: SITE,
  flagOn: true,
  grantOn: true,
  ownerTest: false,
};

function denied(plan: IngestPlan): { status: number } {
  if (!("status" in plan)) throw new Error("expected the collector to refuse this event");
  return plan;
}

function event(path = "/pricing") {
  return {
    event_id: "33333333-3333-4333-8333-333333333333",
    event_name: "page_view",
    path,
    session_id: "sess",
    visitor_key: "visitor",
    returning: false,
  };
}

describe("visitor ingest", () => {
  it("trusts the gateway X-Real-IP, ignores a spoofed first X-Forwarded-For entry, and ignores a body address", () => {
    // The stack gateway appends its peer and overwrites X-Real-IP. The first
    // X-Forwarded-For entry is the one a caller can set. 203.0.113.9 is in
    // this site's excluded range; it must not win, and it must not be the
    // rate-limit prefix.
    expect(trustedClientIp({ forwardedFor: "203.0.113.9, 198.51.100.44", realIp: null })).toBe("198.51.100.44");
    expect(trustedClientIp({ forwardedFor: "not-an-ip, 198.51.100.44" })).toBe("198.51.100.44");
    expect(trustedClientIp({ forwardedFor: "198.51.100.44, 10.0.0.8" })).toBe("198.51.100.44");
    expect(trustedClientIp({
      forwardedFor: "203.0.113.9, 198.51.100.44",
      realIp: "192.0.2.10",
    })).toBe("192.0.2.10");
    expect(trustedClientIp({ forwardedFor: "198.51.100.44", realIp: "not-an-ip" })).toBe("198.51.100.44");
    expect(trustedClientIp({ realIp: "::ffff:198.51.100.44" })).toBe("198.51.100.44");
    // A private X-Real-IP is the peer the gateway wrote. Do not replace it
    // with a public address the caller put in X-Forwarded-For.
    expect(trustedClientIp({ forwardedFor: "198.51.100.44", realIp: "127.0.0.1" })).toBe("127.0.0.1");

    const spoofedFirst = "203.0.113.9, 198.51.100.44";
    const trusted = trustedClientIp({ forwardedFor: spoofedFirst, realIp: null });
    expect(ingestIpRateKey(SITE.id, trusted)).toBe(`visitor-ingest:${SITE.id}:198.51.100.0/24`);
    expect(ingestIpRateKey(SITE.id, "203.0.113.9")).toBe(`visitor-ingest:${SITE.id}:203.0.113.0/24`);

    const plan = planIngest({
      ...base,
      body: { site_id: SITE.id, consent: true, ip: "1.1.1.1", events: [event()] },
      forwardedFor: spoofedFirst,
      realIp: null,
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.ip).toBe("198.51.100.44");

    const realExcluded = planIngest({
      ...base,
      body: { site_id: SITE.id, consent: true, ip: "198.51.100.44", events: [event()] },
      forwardedFor: "198.51.100.44",
      realIp: "203.0.113.9",
    });
    expect(denied(realExcluded).status).toBe(202);
    expect(ingestIpRateKey(SITE.id, trustedClientIp({
      forwardedFor: "198.51.100.44",
      realIp: "203.0.113.9",
    }))).toBe(`visitor-ingest:${SITE.id}:203.0.113.0/24`);
  });

  it("rejects missing consent, a foreign origin, bots, DNT, excluded ranges and oversized bodies", () => {
    expect(planIngest({ ...base, body: { site_id: SITE.id, events: [event()] } }).ok).toBe(false);
    const origin = planIngest({ ...base, origin: "https://evil.test", body: { site_id: SITE.id, consent: true, events: [event()] } });
    expect(denied(origin).status).toBe(403);
    const bot = planIngest({ ...base, userAgent: "AhrefsBot", body: { site_id: SITE.id, consent: true, events: [event()] } });
    expect(bot.ok).toBe(false);
    const dnt = planIngest({ ...base, dnt: "1", body: { site_id: SITE.id, consent: true, events: [event()] } });
    expect(denied(dnt).status).toBe(204);
    const excluded = planIngest({ ...base, forwardedFor: "203.0.113.9", body: { site_id: SITE.id, consent: true, events: [event()] } });
    expect(excluded.ok).toBe(false);
    const huge = planIngest({ ...base, bodyBytes: INGEST_LIMITS.maxBodyBytes + 1, body: { site_id: SITE.id, consent: true, events: [event()] } });
    expect(denied(huge).status).toBe(413);
  });

  it("strips sensitive query params, skips excluded paths, and rate limits", () => {
    const plan = planIngest({
      ...base,
      site: { ...SITE, consentMode: "not_required" },
      body: { site_id: SITE.id, events: [event("/pricing?utm_source=ad&token=secret&email=a@b.c")] },
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.events[0].path).toBe("/pricing");
      expect(plan.events[0].utm).toEqual({ source: "ad" });
      expect(JSON.stringify(plan.events[0])).not.toContain("secret");
      expect(plan.events[0].pageType).toBe("pricing");
    }
    const skipped = planIngest({
      ...base,
      site: { ...SITE, consentMode: "not_required" },
      body: { site_id: SITE.id, events: [event("/checkout")] },
    });
    expect(skipped.ok).toBe(false);
    expect(rateLimited(INGEST_LIMITS.perIpPerMinute, 0)).toBe(true);
    expect(rateLimited(0, INGEST_LIMITS.perSitePerMinute)).toBe(true);
    expect(rateLimited(1, 1)).toBe(false);
    const limited = planIngest({ ...base, ipHits: 120, body: { site_id: SITE.id, consent: true, events: [event()] } });
    expect(denied(limited).status).toBe(429);
  });

  it("stays off unless the flag and the workspace grant are both on", () => {
    expect(featureEnabled(false, true)).toBe(false);
    expect(featureEnabled(true, false)).toBe(false);
    expect(featureEnabled(true, true)).toBe(true);
    const off = planIngest({ ...base, flagOn: false, body: { site_id: SITE.id, consent: true, events: [event()] } });
    expect(denied(off).status).toBe(404);
  });
});

describe("company identity", () => {
  it("classifies ISP, cloud and VPN as Unknown and does not invent a name", () => {
    const isp = decideIdentity({ ptrHost: "c-1-2-3-4.hsd1.ca.comcast.net", rdapOrg: "Comcast Cable Communications", rdapNetwork: "COMCAST", cidr: null, asn: "7922", asnName: "COMCAST-7922", lookupError: null });
    expect(isp.status).toBe("unknown");
    expect(isp.classification).toBe("isp");
    expect(isp.companyName).toBeNull();
    expect(isp.confidence).toBeNull();

    const cloud = decideIdentity({ ptrHost: "ec2-1-2-3-4.compute.amazonaws.com", rdapOrg: "Amazon.com, Inc.", rdapNetwork: "AMAZON-IAD", cidr: null, asn: "16509", asnName: "AMAZON-02", lookupError: null });
    expect(cloud.status).toBe("unknown");
    expect(cloud.classification).toBe("cloud");
    expect(cloud.companyName).toBeNull();

    const vpn = decideIdentity({ ptrHost: "pool-1.mullvad.net", rdapOrg: "Mullvad VPN", rdapNetwork: "MULLVAD", cidr: null, asn: "9009", asnName: "M247", lookupError: null });
    expect(vpn.status).toBe("unknown");
    expect(vpn.classification).toBe("vpn");
    expect(vpn.confidence).toBeNull();
  });

  it("names a company only when DNS and the registry agree, or an existing record matches", () => {
    const agreed = decideIdentity({
      ptrHost: "egress.stripe.com",
      rdapOrg: "Stripe, Inc.",
      rdapNetwork: "STRIPE",
      cidr: "1.2.3.0/24",
      asn: "714",
      asnName: "STRIPE",
      lookupError: null,
    });
    expect(agreed.status).toBe("matched");
    expect(agreed.companyName).toBe("Stripe, Inc.");
    expect(agreed.companyDomain).toBe("stripe.com");
    expect(agreed.confidence).toBe(0.64);

    const disagree = decideIdentity({
      ptrHost: "egress.stripe.com",
      rdapOrg: "Example Holdings",
      rdapNetwork: "EXAMPLE",
      cidr: null,
      asn: "714",
      asnName: "STRIPE",
      lookupError: null,
    });
    expect(disagree.status).toBe("unknown");
    expect(disagree.companyName).toBeNull();

    const local = decideIdentity(
      { ptrHost: "mail.northline.io", rdapOrg: null, rdapNetwork: "NORTHLINE", cidr: null, asn: "714", asnName: "NORTHLINE", lookupError: null },
      { localCompany: { id: "c1", name: "Northline Freight", domain: "northline.io" } },
    );
    expect(local.status).toBe("matched");
    expect(local.companyName).toBe("Northline Freight");
    expect(local.companyId).toBe("c1");
    expect(local.confidence).toBe(0.86);
  });

  it("says so when the lookup produced nothing", () => {
    const empty = decideIdentity({ ptrHost: null, rdapOrg: null, rdapNetwork: null, cidr: null, asn: null, asnName: null, lookupError: "Identity lookup failed." });
    expect(empty.status).toBe("unknown");
    expect(empty.unknownReason).toBe("Identity lookup failed.");
    expect(empty.evidence).toEqual([]);
  });

  it("parses registry answers and visit facts without adding a score", () => {
    expect(parseAsnTxt('"16509 | 1.2.3.0/24 | US | arin | 1999-01-01"')?.asn).toBe("16509");
    const rdap = parseRdap({
      name: "STRIPE",
      cidr0_cidrs: [{ v4prefix: "1.2.3.0", length: 24 }],
      entities: [{ roles: ["registrant"], vcardArray: ["vcard", [["fn", {}, "text", "Stripe, Inc."]]] }],
    });
    expect(rdap.org).toBe("Stripe, Inc.");
    expect(rdap.cidr).toBe("1.2.3.0/24");
    expect(pageTypeFromPath("/pricing")).toBe("pricing");
    expect(pageTypeFromPath("/integrations")).toBe("integrations");
    expect(networkPrefix("198.51.100.20")).toBe("198.51.100.0/24");
    expect(orgAgreesWithDomain("Stripe, Inc.", "stripe.com")).toBe(true);
    expect(sanitizeTrackingUrl("https://acme.test/pricing?token=abc&utm_medium=cpc").utm).toEqual({ medium: "cpc" });
    expect(isBotUserAgent("")).toBe(true);
    const facts = visitFacts([
      { path: "/pricing", page_type: "pricing", event_name: "page_view" },
      { path: "/pricing", page_type: "pricing", event_name: "page_view" },
    ]);
    expect(facts).toEqual(["Visited /pricing 2 times (pricing)."]);
    expect(JSON.stringify(facts)).not.toMatch(/score/i);
  });
});

describe("automation caps", () => {
  const rule = {
    enabled: true,
    minConfidence: 0.7,
    pageTypes: ["pricing"],
    eventNames: ["page_view"],
    actions: ["find_contacts", "enrich", "draft", "send"],
    dailyCap: 100,
    sequenceId: null,
  };
  const match = { status: "matched" as const, confidence: 0.8, pageTypes: ["pricing"], eventNames: ["page_view"] };

  it("drops send, refuses Unknown, and stops at the daily caps", () => {
    const planned = planRuleRun({ rule, match, runsTodayForRule: 0, runsTodayForWorkspace: 0, alreadyRan: false });
    expect(planned.run).toBe(true);
    expect(planned.actions).not.toContain("send");
    expect(planned.actions).toEqual(["find_contacts", "enrich", "draft"]);

    const unknown = planRuleRun({
      rule,
      match: { ...match, status: "unknown", confidence: null },
      runsTodayForRule: 0,
      runsTodayForWorkspace: 0,
      alreadyRan: false,
    });
    expect(unknown.run).toBe(false);

    const capped = planRuleRun({ rule, match, runsTodayForRule: RULE_DAILY_CAP_MAX, runsTodayForWorkspace: 0, alreadyRan: false });
    expect(capped.run).toBe(false);
    expect(capped.reason).toContain(String(RULE_DAILY_CAP_MAX));

    const workspace = planRuleRun({ rule, match, runsTodayForRule: 0, runsTodayForWorkspace: WORKSPACE_DAILY_CAP, alreadyRan: false });
    expect(workspace.run).toBe(false);

    const again = planRuleRun({ rule, match, runsTodayForRule: 0, runsTodayForWorkspace: 0, alreadyRan: true });
    expect(again.run).toBe(false);
  });

  it("does not enroll without a sequence", () => {
    const planned = planRuleRun({
      rule: { ...rule, actions: ["enroll"] },
      match,
      runsTodayForRule: 0,
      runsTodayForWorkspace: 0,
      alreadyRan: false,
    });
    expect(planned.run).toBe(false);
  });
});

describe("tracking script", () => {
  it("matches the file served from the app", () => {
    expect(readFileSync("public/v.js", "utf8")).toBe(VISITOR_SDK_SOURCE);
  });

  it("sanitises URLs, batches, follows SPA navigations, and opts out", async () => {
    const first = boot({ consent: "not_required" });
    first.context.OutReign.flush();
    const body = await readSent(first.sent);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].path).toBe("/");
    expect(first.sent[0].via).toBe("beacon");

    first.context.history.pushState(null, "", "/pricing?utm_source=ad&token=secret");
    first.context.OutReign.track("demo_clicked", { plan: "pro", password: "nope", email: "a@b.c" });
    first.context.OutReign.flush();
    const second = await readSent(first.sent);
    expect(second.events.map((row: { path: string }) => row.path)).toEqual(["/pricing", "/pricing"]);
    expect(JSON.stringify(second)).not.toContain("secret");
    expect(JSON.stringify(second)).not.toContain("password");
    expect(JSON.stringify(second)).toContain("demo_clicked");
    expect(second.events[1].props).toEqual({ plan: "pro" });
    expect(second.events[0].utm).toEqual({ source: "ad" });

    first.context.OutReign.disable();
    first.context.OutReign.track("later", { plan: "pro" });
    first.context.OutReign.flush();
    expect(first.sent).toHaveLength(2);

    const dnt = boot({ consent: "not_required", dnt: "1" });
    dnt.context.OutReign.flush();
    expect(dnt.sent).toHaveLength(0);

    const waiting = boot({ consent: "required" });
    waiting.context.OutReign.flush();
    expect(waiting.sent).toHaveLength(0);
    waiting.context.OutReign.consent();
    waiting.context.OutReign.flush();
    const consented = await readSent(waiting.sent);
    expect(consented.events).toHaveLength(1);
    expect(consented.consent).toBe(true);

    const fallback = boot({ consent: "not_required", beacon: false });
    fallback.context.OutReign.flush();
    expect(fallback.sent.at(-1)?.via).toBe("fetch");
  });
});

describe("rules stay inside the workspace that owns the site", () => {
  it("loads rules for the job's user, and skips work when the flag or grant is off", () => {
    const src = readFileSync("supabase/functions/visitor-resolve/index.ts", "utf8");
    const rules = src.slice(src.indexOf('from("visitor_rules")'), src.indexOf("const since"));
    expect(rules).toContain('.eq("site_id", job.site_id)');
    expect(rules).toContain('.eq("user_id", job.user_id)');
    const start = src.indexOf("runResolveBatch");
    const gateAt = src.indexOf("workspaceEnabled", start);
    const resolveAt = src.indexOf("resolveJob", start);
    expect(gateAt).toBeGreaterThan(start);
    expect(resolveAt).toBeGreaterThan(gateAt);
  });
});

describe("agent writes honour the flag and the site owner", () => {
  const toolEvents: Array<{ name: string; label: string; status: "ok" | "error"; detail?: string }> = [];

  function adminFor(tables: Record<string, { data: unknown }>) {
    const ops: string[] = [];
    const from = (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => Promise.resolve({ data: tables[table]?.data ?? null, error: null }),
        insert: () => {
          ops.push(`insert:${table}`);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "rule-1" }, error: null }) }) };
        },
      };
      return chain;
    };
    return { admin: { from }, ops };
  }

  it("refuses a site write when the flag or the grant is off", async () => {
    const off = adminFor({ feature_flags: { data: { is_enabled: true } }, visitor_workspace_grants: { data: { enabled: false } } });
    const result = await runOutboundTool("save_visitor_site", { name: "Other" }, {
      admin: off.admin, userId: "user-a", toolEvents,
    });
    expect(result).toEqual({ error: "Visitor Intelligence is off for this workspace." });
    expect(off.ops).not.toContain("insert:visitor_sites");
  });

  it("refuses a rule when the flag or the grant is off", async () => {
    const off = adminFor({ feature_flags: { data: { is_enabled: false } }, visitor_workspace_grants: { data: { enabled: true } } });
    const result = await runOutboundTool("save_visitor_rule", { site_id: "site-b", name: "Stolen" }, {
      admin: off.admin, userId: "user-a", toolEvents,
    });
    expect(result).toEqual({ error: "Visitor Intelligence is off for this workspace." });
    expect(off.ops).not.toContain("insert:visitor_rules");
  });

  it("refuses a rule whose site belongs to someone else", async () => {
    const foreign = adminFor({
      feature_flags: { data: { is_enabled: true } },
      visitor_workspace_grants: { data: { enabled: true } },
      visitor_sites: { data: null },
    });
    const result = await runOutboundTool("save_visitor_rule", { site_id: "site-b", name: "Stolen" }, {
      admin: foreign.admin, userId: "user-a", toolEvents,
    });
    expect(result).toEqual({ error: "Site was not found in this workspace." });
    expect(foreign.ops).not.toContain("insert:visitor_rules");
  });
});

describe("resolve throughput", () => {
  const jobs = Array.from({ length: 20 }, (_, i) => ({ id: `job-${i}`, attempts: 1 }));

  it("claims a bounded batch and leaves jobs past the time budget queued", async () => {
    expect(RESOLVE_CLAIM_LIMIT).toBe(20);
    expect(RESOLVE_CONCURRENCY).toBe(4);
    expect(RESOLVE_WALL_BUDGET_MS).toBe(50_000);
    expect(RESOLVE_WALL_BUDGET_MS).toBeLessThan(150_000);

    let now = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const { started, deferred } = await runResolveBatch(jobs, {
      concurrency: RESOLVE_CONCURRENCY,
      budgetMs: 30,
      startedAt: 0,
      now: () => now,
      run: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        now += 20;
      },
    });

    expect(started.length).toBeGreaterThan(0);
    expect(started.length).toBeLessThan(jobs.length);
    expect(started.length + deferred.length).toBe(jobs.length);
    expect(maxInFlight).toBeLessThanOrEqual(RESOLVE_CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(1);
    const startedIds = new Set(started.map((job) => job.id));
    expect(deferred.some((job) => startedIds.has(job.id))).toBe(false);
    // The claim already counted an attempt. Handing the job back must undo it
    // and return the row to queued, or the 3-attempt reclaim burns a try the
    // worker never made.
    expect(releaseQueuedClaim(deferred[0].attempts)).toEqual({ status: "queued", attempts: 0, claimed_at: null });
    expect(releaseQueuedClaim(3)).toEqual({ status: "queued", attempts: 2, claimed_at: null });
  });

  it("starts nothing when the budget is already spent", async () => {
    const { started, deferred } = await runResolveBatch(jobs, {
      concurrency: RESOLVE_CONCURRENCY,
      budgetMs: RESOLVE_WALL_BUDGET_MS,
      startedAt: 0,
      now: () => RESOLVE_WALL_BUDGET_MS,
      run: async () => { throw new Error("should not start"); },
    });
    expect(started).toEqual([]);
    expect(deferred).toHaveLength(jobs.length);
  });

  it("asks the claim for the batch cap and releases only rows still running", () => {
    const src = readFileSync("supabase/functions/visitor-resolve/index.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("p_limit: RESOLVE_CLAIM_LIMIT");
    expect(src).toContain("releaseQueuedClaim(job.attempts)");
    expect(src).toMatch(/releaseQueuedClaim\(job\.attempts\)[\s\S]{0,120}\.eq\("status", "running"\)/);
    const claim = readFileSync("supabase/migrations/20261115203000_visitor_rule_tenant_and_reclaim.sql", "utf8");
    expect(claim).toContain("LEAST(COALESCE(p_limit, 5), 20)");
    expect(claim).toContain("attempts >= 3");
    expect(claim).toContain("attempts < 3");
  });
});

describe("one address is one resolve job", () => {
  it("inserts and treats a unique conflict as the existing row", () => {
    const ingest = readFileSync("supabase/functions/visitor-ingest/index.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(ingest).toContain('req.headers.get("x-real-ip")');
    expect(ingest).toContain("trustedClientIp({ forwardedFor: forwarded, realIp })");
    expect(ingest).toContain("ingestIpRateKey(siteId, observed)");
    expect(ingest).toContain('enqueued.error?.code === "23505"');
    expect(ingest).toContain('.in("status", ["done", "failed"])');
    expect(ingest).not.toContain('.select("id, status")');
    const migration = readFileSync("supabase/migrations/20261115180000_visitor_intelligence.sql", "utf8");
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_jobs_hash\s+ON public\.visitor_resolve_jobs \(site_id, ip_hash\)/,
    );
  });
});

describe("the collector stays on the free signals", () => {
  it("does not call a visitor-ID vendor and keeps the function public but self-checked", () => {
    const resolve = readFileSync("supabase/functions/visitor-resolve/index.ts", "utf8");
    const ingest = readFileSync("supabase/functions/visitor-ingest/index.ts", "utf8");
    const config = readFileSync("supabase/config.toml", "utf8");
    const layout = readFileSync("src/components/dashboard/DashboardLayout.tsx", "utf8");
    for (const name of ["rb2b", "warmly", "leadfeeder", "clearbit", "albacross", "snitcher"]) {
      expect(resolve.toLowerCase()).not.toContain(name);
      expect(ingest.toLowerCase()).not.toContain(name);
    }
    expect(resolve).toContain("rdap.org");
    expect(resolve).toContain("cloudflare-dns.com");
    expect(resolve).toContain('status: "paused"');
    expect(ingest).toContain("trustedClientIp");
    expect(config).toMatch(/\[functions\.visitor-ingest\]\s*\n\s*verify_jwt = false/);
    expect(layout).toContain('item.href !== "/dashboard/visitors" || visitorIntelligence');
  });
});

function boot(options: { consent: string; dnt?: string; beacon?: boolean }) {
  const store = new Map<string, string>();
  const sent: { via: string; body: string }[] = [];
  const location = { pathname: "/", search: "", href: "https://acme.test/", origin: "https://acme.test" };
  const sandbox: Record<string, unknown> = {
    console,
    URL,
    crypto,
    Blob,
    Date,
    Math,
    setTimeout,
    clearTimeout,
    location,
    navigator: {
      doNotTrack: options.dnt ?? null,
      globalPrivacyControl: false,
      sendBeacon(_url: string, blob: Blob) {
        if (options.beacon === false) return false;
        void blob.text().then((body) => sent.push({ via: "beacon", body }));
        return true;
      },
    },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
    },
    document: {
      currentScript: {
        getAttribute(name: string) {
          const attrs: Record<string, string> = {
            "data-site-id": "11111111-1111-4111-8111-111111111111",
            "data-consent": options.consent,
            "data-endpoint": "https://example.test/ingest",
          };
          return attrs[name] ?? null;
        },
        src: "https://app.test/v.js",
      },
      referrer: "https://google.test/search",
      addEventListener() {},
      documentElement: { scrollHeight: 2000 },
    },
    history: {
      pushState(_state: unknown, _title: string, url: string) {
        const next = new URL(url, location.href);
        location.pathname = next.pathname;
        location.search = next.search;
        location.href = next.toString();
      },
      replaceState(state: unknown, title: string, url: string) {
        (sandbox.history as { pushState: (a: unknown, b: string, c: string) => void }).pushState(state, title, url);
      },
    },
    addEventListener() {},
    fetch(_url: string, init: { body: string }) {
      sent.push({ via: "fetch", body: init.body });
      return Promise.resolve({ ok: true });
    },
    scrollY: 0,
    innerHeight: 800,
    __OUTREIGN_SDK_TEST__: true,
  };
  sandbox.globalThis = sandbox;
  runInContext(VISITOR_SDK_SOURCE, createContext(sandbox));
  return { context: sandbox as { OutReign: { flush: () => void; track: (n: string, p?: Record<string, unknown>) => void; disable: () => void; consent: () => void }; history: { pushState: (a: unknown, b: string, c: string) => void } }, sent };
}

async function readSent(sent: { body: string }[]) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return JSON.parse(sent.at(-1)!.body);
}
