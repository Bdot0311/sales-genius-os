import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  verifyEmail,
  verifyEmails,
} from "../../supabase/functions/_shared/email-verify.ts";

// The module reads its provider config from Deno.env and calls out over fetch.
// Both are stubbed so these tests exercise the real decision logic without a
// network or a vendor account.

type EnvMap = Record<string, string>;

function setEnv(env: EnvMap) {
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: { get: (k: string) => env[k] },
  };
}

/** Cache that always misses and swallows writes — every test starts cold. */
const noCache = {
  from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    upsert: async () => ({}),
  }),
} as never;

/** DoH answers keyed by "<name>|<type>", plus canned provider responses. */
function stubFetch(opts: { mx?: string[]; a?: string[]; provider?: unknown; providerStatus?: number }) {
  const spy = vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (url.includes("cloudflare-dns.com")) {
      const type = new URL(url).searchParams.get("type");
      const answers = type === "MX" ? (opts.mx ?? []) : (opts.a ?? []);
      return new Response(JSON.stringify({ Status: 0, Answer: answers.map((d) => ({ data: d })) }), { status: 200 });
    }
    return new Response(JSON.stringify(opts.provider ?? {}), { status: opts.providerStatus ?? 200 });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const LIVE_MX = { mx: ["10 mx.example.com."] };

beforeEach(() => setEnv({}));
afterEach(() => vi.unstubAllGlobals());

describe("free gate — runs before any paid call", () => {
  it("rejects malformed addresses without touching DNS or the vendor", async () => {
    const fetchSpy = stubFetch(LIVE_MX);
    const r = await verifyEmail(noCache, "not-an-email");
    expect(r.status).toBe("invalid");
    expect(r.verified).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects disposable domains without touching DNS or the vendor", async () => {
    const fetchSpy = stubFetch(LIVE_MX);
    const r = await verifyEmail(noCache, "someone@mailinator.com");
    expect(r.status).toBe("invalid");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a domain with no MX and no A record", async () => {
    stubFetch({ mx: [], a: [] });
    const r = await verifyEmail(noCache, "ceo@dead-domain.com");
    expect(r.status).toBe("invalid");
    expect(r.reason).toMatch(/no mail server/i);
  });

  it("accepts a domain that only has an A record", async () => {
    setEnv({ EMAIL_VERIFIER_API_KEY: "k" });
    stubFetch({ mx: [], a: ["93.184.216.34"], provider: { status: "valid" } });
    const r = await verifyEmail(noCache, "ceo@a-record-only.com");
    expect(r.status).toBe("valid");
  });

  it("fails open when the resolver itself errors, rather than condemning a real company", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r.status).not.toBe("invalid");
  });
});

describe("DNS-only mode (no verifier key configured)", () => {
  it("never claims an address is verified — MX proves the domain, not the mailbox", async () => {
    stubFetch(LIVE_MX);
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r.status).toBe("unknown");
    expect(r.verified).toBeNull();
  });

  it("never calls a vendor", async () => {
    const fetchSpy = stubFetch(LIVE_MX);
    await verifyEmail(noCache, "ceo@example.com");
    const hosts = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(hosts.every((h) => h.includes("cloudflare-dns.com"))).toBe(true);
  });
});

describe("provider verdict mapping", () => {
  beforeEach(() => setEnv({ EMAIL_VERIFIER_API_KEY: "test-key" }));

  it("maps a clean valid verdict to verified", async () => {
    stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r).toMatchObject({ status: "valid", verified: true });
  });

  it("does NOT trust 'valid' when the vendor also flags the domain catch-all", async () => {
    // The handshake succeeds for every address on a catch-all domain, real or
    // not. Reporting this as verified is precisely how a bounce ships.
    stubFetch({ ...LIVE_MX, provider: { status: "valid", is_catch_all: true } });
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r.status).toBe("catch_all");
    expect(r.verified).toBeNull();
  });

  it("maps an explicit undeliverable verdict to invalid", async () => {
    stubFetch({ ...LIVE_MX, provider: { status: "invalid" } });
    const r = await verifyEmail(noCache, "ghost@example.com");
    expect(r).toMatchObject({ status: "invalid", verified: false });
  });

  it("treats 'risky' as unproven, never as verified", async () => {
    stubFetch({ ...LIVE_MX, provider: { status: "risky" } });
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r.status).toBe("unknown");
    expect(r.verified).toBeNull();
  });

  it("degrades an unrecognised verdict to unknown instead of guessing", async () => {
    stubFetch({ ...LIVE_MX, provider: { status: "brand_new_vendor_state" } });
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r.status).toBe("unknown");
  });

  it("degrades to unknown when the vendor errors, without condemning the address", async () => {
    stubFetch({ ...LIVE_MX, provider: {}, providerStatus: 500 });
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r.status).toBe("unknown");
    expect(r.verified).toBeNull();
  });

  it("keeps our own role verdict when the vendor only says 'deliverable'", async () => {
    // info@ existing is not the question; whether it is safe to cold-email is.
    stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    const r = await verifyEmail(noCache, "info@example.com");
    expect(r.status).toBe("role");
    expect(r.verified).toBeNull();
  });

  it("still lets the vendor overrule a role address it proves is dead", async () => {
    stubFetch({ ...LIVE_MX, provider: { status: "invalid" } });
    const r = await verifyEmail(noCache, "info@example.com");
    expect(r.status).toBe("invalid");
  });
});

describe("ColdIQ as the verification provider", () => {
  it("activates on COLDIQ_API_KEY alone — there is no second key to configure", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    const fetchSpy = stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r.status).toBe("valid");
    expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("coldiq"))).toBe(true);
  });

  it("lets an explicit verifier key win, so lead search and verification can use different vendors", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-key", EMAIL_VERIFIER_API_KEY: "reoon-key" });
    const fetchSpy = stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    await verifyEmail(noCache, "ceo@example.com");
    const urls = fetchSpy.mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes("reoon"))).toBe(true);
    expect(urls.some((u) => u.includes("coldiq"))).toBe(false);
  });

  it("sends the key as a header, never in the query string", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-secret" });
    const fetchSpy = stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    await verifyEmail(noCache, "ceo@example.com");
    const call = fetchSpy.mock.calls.find(([u]) => String(u).includes("coldiq"));
    expect(String(call?.[0])).not.toContain("cq-secret");
    const init = call?.[1] as RequestInit | undefined;
    expect(JSON.stringify(init?.headers ?? {})).toContain("cq-secret");
  });

  it("reads a verdict the marketplace wrapped in `data`", async () => {
    // A proxied vendor answer is usually nested. Without unwrapping,
    // String({...}) is "[object Object]", every verdict degrades to unknown,
    // and the paid checks buy nothing at all.
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    stubFetch({ ...LIVE_MX, provider: { data: { status: "valid" } } });
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r).toMatchObject({ status: "valid", verified: true });
  });

  it("reads a verdict nested two wrappers deep", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    stubFetch({ ...LIVE_MX, provider: { data: { result: { status: "invalid" } } } });
    const r = await verifyEmail(noCache, "ghost@example.com");
    expect(r).toMatchObject({ status: "invalid", verified: false });
  });

  it("still honours a catch-all flag carried alongside a wrapped verdict", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    stubFetch({ ...LIVE_MX, provider: { data: { status: "valid", is_catch_all: true } } });
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r.status).toBe("catch_all");
    expect(r.verified).toBeNull();
  });

  it("degrades to unknown when the marketplace shape is unreadable", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    stubFetch({ ...LIVE_MX, provider: { something: { entirely: "different" } } });
    const r = await verifyEmail(noCache, "ceo@example.com");
    expect(r.status).toBe("unknown");
    expect(r.verified).toBeNull();
  });
});

describe("first-call shape logging", () => {
  // Module-level "log once" state means each of these needs a fresh module
  // instance, hence resetModules + dynamic import rather than the top import.
  const freshVerify = async () => {
    vi.resetModules();
    const mod = await import("../../supabase/functions/_shared/email-verify.ts");
    return mod.verifyEmail;
  };

  it("logs the response shape so an unread contract can be pinned from one live call", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    stubFetch({ ...LIVE_MX, provider: { data: { status: "valid", credits_used: 1 } } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const verify = await freshVerify();
    await verify(noCache, "ceo@example.com");

    const line = log.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("response shape"));
    expect(line).toBeDefined();
    expect(line).toContain("status");
    expect(line).toContain("credits_used");
    log.mockRestore();
  });

  it("never puts a prospect's address or any value in that log line", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    stubFetch({ ...LIVE_MX, provider: { email: "ceo@example.com", status: "valid", score: 98 } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const verify = await freshVerify();
    await verify(noCache, "ceo@example.com");

    const line = log.mock.calls.map((c) => c.join(" ")).find((l) => l.includes("response shape"));
    expect(line).toBeDefined();
    // Key names are what pin a schema. Values are the prospect's data and a
    // vendor's verdict about them, and belong nowhere near a log.
    expect(line).toContain("email");
    expect(line).not.toContain("ceo@example.com");
    expect(line).not.toContain("98");
    log.mockRestore();
  });

  it("logs once, not once per address in the batch", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const verify = await freshVerify();
    await verify(noCache, "a@example.com");
    await verify(noCache, "b@example.com");
    await verify(noCache, "c@example.com");

    const lines = log.mock.calls.map((c) => c.join(" ")).filter((l) => l.includes("response shape"));
    expect(lines).toHaveLength(1);
    log.mockRestore();
  });
});

describe("batch verification", () => {
  beforeEach(() => setEnv({ EMAIL_VERIFIER_API_KEY: "test-key" }));

  it("deduplicates addresses so the same mailbox is never billed twice", async () => {
    const fetchSpy = stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    const out = await verifyEmails(noCache, ["ceo@example.com", "CEO@Example.com", "ceo@example.com"]);
    expect(out.size).toBe(1);
    const vendorCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes("reoon"));
    expect(vendorCalls).toHaveLength(1);
  });

  it("ignores blank entries rather than spending a lookup on them", async () => {
    stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    const out = await verifyEmails(noCache, ["", "   ", "ceo@example.com"]);
    expect(out.size).toBe(1);
  });

  it("returns a verdict for every distinct address it was given", async () => {
    stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    const out = await verifyEmails(noCache, ["a@example.com", "b@example.com", "c@example.com"]);
    expect([...out.keys()].sort()).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
  });

  it("marks work left over at the deadline as pending rather than failing the search", async () => {
    stubFetch({ ...LIVE_MX, provider: { status: "valid" } });
    const out = await verifyEmails(noCache, ["a@example.com", "b@example.com"], {
      concurrency: 1,
      deadlineMs: -1,
    });
    expect([...out.values()].every((v) => v.status === "unknown")).toBe(true);
  });
});

describe("ColdIQ contract, confirmed against the OpenAPI spec", () => {
  it("nests the address under `input`, which is what the API accepts", async () => {
    // A flat {email} is rejected. This was wrong until the spec was read.
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    const fetchSpy = stubFetch({ ...LIVE_MX, provider: { data: { status: "deliverable" } } });
    await verifyEmail(noCache, "ceo@example.com");
    const call = fetchSpy.mock.calls.find(([u]) => String(u).includes("coldiq"));
    const body = JSON.parse(String((call?.[1] as RequestInit)?.body ?? "{}"));
    expect(body).toHaveProperty("input.email", "ceo@example.com");
    expect(body).not.toHaveProperty("email");
  });

  it("reads the spec's own vocabulary", async () => {
    // The endpoint documents: deliverable, risky, catch-all, invalid.
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    for (const [verdict, expected] of [
      ["deliverable", "valid"],
      ["risky", "unknown"],
      ["catch-all", "catch_all"],
      ["invalid", "invalid"],
    ] as const) {
      stubFetch({ ...LIVE_MX, provider: { data: { status: verdict } } });
      const r = await verifyEmail(noCache, "ceo@example.com");
      expect(r.status, verdict).toBe(expected);
    }
  });

  it("batches instead of sending one request per address", async () => {
    // 100 leads was 100 round trips; the verb takes 50 inputs per call.
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    const fetchSpy = stubFetch({
      ...LIVE_MX,
      provider: { results: Array.from({ length: 50 }, () => ({ status: "deliverable" })) },
    });
    const addrs = Array.from({ length: 60 }, (_, i) => `p${i}@example.com`);
    await verifyEmails(noCache, addrs);
    const vendorCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes("coldiq"));
    expect(vendorCalls.length).toBeLessThanOrEqual(2);
    const first = JSON.parse(String((vendorCalls[0]?.[1] as RequestInit)?.body ?? "{}"));
    expect(Array.isArray(first.inputs)).toBe(true);
    expect(first.inputs.length).toBeLessThanOrEqual(50);
  });

  it("never sends an address the free gate already rejected", async () => {
    // The spec bills per conclusively-verified address, so not sending is not paying.
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    const fetchSpy = stubFetch({ ...LIVE_MX, provider: { results: [{ status: "deliverable" }] } });
    await verifyEmails(noCache, ["ceo@example.com", "someone@mailinator.com", "nope"]);
    const vendorCalls = fetchSpy.mock.calls.filter(([u]) => String(u).includes("coldiq"));
    const sent = JSON.parse(String((vendorCalls[0]?.[1] as RequestInit)?.body ?? "{}"));
    const addresses = (sent.inputs ?? []).map((i: { email: string }) => i.email);
    expect(addresses).toContain("ceo@example.com");
    expect(addresses).not.toContain("someone@mailinator.com");
    expect(addresses).not.toContain("nope");
  });

  it("leaves an address unresolved when the batch response has no row for it", async () => {
    // A gappy array must not be read as a clean verdict.
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    stubFetch({ ...LIVE_MX, provider: { results: [{ status: "deliverable" }] } });
    const out = await verifyEmails(noCache, ["a@example.com", "b@example.com"]);
    expect(out.get("a@example.com")?.status).toBe("valid");
    expect(out.get("b@example.com")?.verified).toBeNull();
  });

  it("omits the spend cap unless one is configured", async () => {
    // Capping too low silently converts verifications into misses.
    setEnv({ COLDIQ_API_KEY: "cq-key" });
    const fetchSpy = stubFetch({ ...LIVE_MX, provider: { data: { status: "deliverable" } } });
    await verifyEmail(noCache, "ceo@example.com");
    const call = fetchSpy.mock.calls.find(([u]) => String(u).includes("coldiq"));
    expect(JSON.parse(String((call?.[1] as RequestInit)?.body ?? "{}"))).not.toHaveProperty("max_credits");
  });

  it("passes the spend cap through when set", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-key", COLDIQ_MAX_CREDITS: "1.5" });
    const fetchSpy = stubFetch({ ...LIVE_MX, provider: { data: { status: "deliverable" } } });
    await verifyEmail(noCache, "ceo@example.com");
    const call = fetchSpy.mock.calls.find(([u]) => String(u).includes("coldiq"));
    expect(JSON.parse(String((call?.[1] as RequestInit)?.body ?? "{}"))).toHaveProperty("max_credits", 1.5);
  });
});
