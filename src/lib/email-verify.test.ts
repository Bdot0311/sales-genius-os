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
