import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { planRuleRun, RULE_DAILY_CAP_MAX, WORKSPACE_DAILY_CAP } from "../../supabase/functions/_shared/visitor-automation.ts";
import { INGEST_LIMITS, planIngest, rateLimited, type IngestPlan, type IngestSite } from "../../supabase/functions/_shared/visitor-ingest.ts";
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
  it("takes the platform hop from x-forwarded-for and ignores a body address", () => {
    expect(trustedClientIp("1.2.3.4, 198.51.100.20")).toBe("198.51.100.20");
    expect(trustedClientIp("not-an-ip, 203.0.113.9")).toBe("203.0.113.9");
    const plan = planIngest({
      ...base,
      body: { site_id: SITE.id, consent: true, ip: "8.8.8.8", events: [event()] },
      forwardedFor: "8.8.8.8, 198.51.100.8",
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.ip).toBe("198.51.100.8");
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
