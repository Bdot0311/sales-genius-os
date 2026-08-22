import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coldiqFindEmail } from "../../supabase/functions/_shared/coldiq.ts";
import { readFileSync } from "node:fs";

const ENRICH = readFileSync(
  new URL("../../supabase/functions/enrich-lead/index.ts", import.meta.url),
  "utf8",
);

const setEnv = (e: Record<string, string>) =>
  ((globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => e[k] } });

beforeEach(() => setEnv({ COLDIQ_API_KEY: "k" }));
afterEach(() => vi.unstubAllGlobals());

/**
 * In an email-only product a lead with a name, a company and no address is one
 * the user cannot act on at all — despite having paid for it. The primary
 * enrichment asks a single provider; this asks the marketplace waterfall.
 */
describe("finding an email the primary provider missed", () => {
  it("sends what we already know, nested under input", async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init: RequestInit) => new Response(JSON.stringify({ data: { email: "j@acme.com" } }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    const r = await coldiqFindEmail({ first_name: "Jane", last_name: "Doe", domain: "acme.com" });
    expect(r.email).toBe("j@acme.com");
    const body = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(body.input).toMatchObject({ first_name: "Jane", last_name: "Doe", domain: "acme.com" });
  });

  it("reads the address from whichever field the marketplace used", async () => {
    for (const shape of [{ email: "a@b.com" }, { work_email: "a@b.com" }, { business_email: "a@b.com" }]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: shape }), { status: 200 })));
      expect((await coldiqFindEmail({ first_name: "A", last_name: "B", domain: "b.com" })).email).toBe("a@b.com");
    }
  });

  it("does not call out when there is nothing to search on", async () => {
    // A name with no company handle, or a company with no name, cannot resolve
    // a person — firing spends latency to learn nothing.
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect((await coldiqFindEmail({ first_name: "Jane" })).email).toBeNull();
    expect((await coldiqFindEmail({ domain: "acme.com" })).email).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("accepts a LinkedIn URL alone as sufficient", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await coldiqFindEmail({ linkedin_url: "https://linkedin.com/in/jane" });
    expect(spy).toHaveBeenCalled();
  });

  it("leaves the lead untouched when the finder fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const r = await coldiqFindEmail({ first_name: "A", last_name: "B", domain: "b.com" });
    expect(r.email).toBeNull();
    expect(r.error).toContain("500");
  });

  it("keeps the extra-credit employer lookup off unless asked for", async () => {
    const spy = vi.fn(async (_input: RequestInfo | URL, _init: RequestInit) => new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await coldiqFindEmail({ linkedin_url: "https://linkedin.com/in/jane" });
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)))
      .not.toHaveProperty("resolve_current_employer");
  });
});

describe("a found address is a guess until verified", () => {
  it("verifies before storing", () => {
    // Storing one unverified is how the original bounce happened — and it is
    // worse here, because the user has no reason to doubt an address the
    // product volunteered.
    expect(ENRICH).toContain("await verifyEmail(supabase, foundEmail)");
    expect(ENRICH).toContain("verdict.status === 'invalid'");
  });

  it("discards an address proven undeliverable rather than saving it", () => {
    expect(ENRICH).toContain("discarded found email");
  });

  it("records the verdict alongside the address", () => {
    expect(ENRICH).toContain("email_verification_status = verdict.status");
  });

  it("only runs when the lead actually lacks an email", () => {
    expect(ENRICH).toContain("!lead.contact_email && !enrichmentData.contact_email && coldiqConfigured()");
  });

  it("only passes a personal LinkedIn, never a company page", () => {
    expect(ENRICH).toContain("isPersonLinkedIn(String(lead.linkedin_url ?? ''))");
  });
});
