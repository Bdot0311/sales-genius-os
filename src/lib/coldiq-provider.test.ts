import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coldiqLeadsMode,
  coldiqSearchPeople,
  extractRecords,
} from "../../supabase/functions/_shared/coldiq.ts";
import { readFileSync } from "node:fs";

const FETCH_LEADS = readFileSync(
  new URL("../../supabase/functions/fetch-external-leads/index.ts", import.meta.url),
  "utf8",
);

function setEnv(env: Record<string, string>) {
  (globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => env[k] } };
}
const okResponse = (body: unknown) =>
  vi.fn(async (_url?: string | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status: 200 }));

beforeEach(() => setEnv({}));
afterEach(() => vi.unstubAllGlobals());

describe("when ColdIQ is allowed to source leads", () => {
  it("defaults to fallback, so a search that already worked never spends a credit", () => {
    setEnv({ COLDIQ_API_KEY: "k" });
    expect(coldiqLeadsMode()).toBe("fallback");
  });

  it("can be switched off entirely", () => {
    setEnv({ COLDIQ_API_KEY: "k", COLDIQ_LEADS: "off" });
    expect(coldiqLeadsMode()).toBe("off");
  });

  it("only runs after the primary returned nothing", () => {
    // The credit is already spent by then; the alternative is an empty page.
    expect(FETCH_LEADS).toContain('rawLeads.length === 0 && coldiqConfigured() && coldiqLeadsMode() === "fallback"');
  });

  it("does not fire blind when the search parsed into nothing to anchor on", () => {
    // The verb has no free-text query — titles, seniorities, keywords or
    // domains are the only handles it takes.
    expect(FETCH_LEADS).toContain("hasAnchor");
    expect(FETCH_LEADS).toContain("nothing to anchor a people search on");
  });

  it("routes marketplace records through the same mapper as every provider", () => {
    expect(FETCH_LEADS).toContain("rawLeads = records;");
  });

  it("attributes the results to ColdIQ rather than the primary", () => {
    // Otherwise the spend telemetry cannot tell which provider earned its cost.
    expect(FETCH_LEADS).toContain("sourcedFromColdIq ? 'coldiq'");
  });
});

describe("request shape matches the spec", () => {
  it("nests filters under `input`", async () => {
    setEnv({ COLDIQ_API_KEY: "k" });
    const spy = okResponse({ data: [] });
    vi.stubGlobal("fetch", spy);
    await coldiqSearchPeople({ job_titles: ["CEO"], limit: 10 });
    const body = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(body).toHaveProperty("input.job_titles", ["CEO"]);
    expect(body).not.toHaveProperty("job_titles");
  });

  it("drops empty arrays so an unset filter never becomes one that matches nothing", async () => {
    setEnv({ COLDIQ_API_KEY: "k" });
    const spy = okResponse({ data: [] });
    vi.stubGlobal("fetch", spy);
    await coldiqSearchPeople({ job_titles: ["CEO"], seniorities: [], keywords: ["  "], limit: 5 });
    const { input } = JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body));
    expect(input).toHaveProperty("job_titles");
    expect(input).not.toHaveProperty("seniorities");
    expect(input).not.toHaveProperty("keywords");
  });

  it("sends the key as a header, never in the URL", async () => {
    setEnv({ COLDIQ_API_KEY: "cq-secret" });
    const spy = okResponse({ data: [] });
    vi.stubGlobal("fetch", spy);
    await coldiqSearchPeople({ job_titles: ["CEO"] });
    expect(String(spy.mock.calls[0][0])).not.toContain("cq-secret");
    expect(JSON.stringify(spy.mock.calls[0][1])).toContain("cq-secret");
  });
});

describe("a failure leaves the caller where it was", () => {
  it("returns an error rather than throwing on a non-200", async () => {
    setEnv({ COLDIQ_API_KEY: "k" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no credits", { status: 402 })));
    const r = await coldiqSearchPeople({ job_titles: ["CEO"] });
    expect(r.records).toHaveLength(0);
    expect(r.error).toContain("402");
  });

  it("returns an error rather than throwing on a network failure", async () => {
    setEnv({ COLDIQ_API_KEY: "k" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const r = await coldiqSearchPeople({ job_titles: ["CEO"] });
    expect(r.records).toHaveLength(0);
    expect(r.error).toBe("boom");
  });

  it("does nothing at all without a key", async () => {
    const spy = okResponse({ data: [] });
    vi.stubGlobal("fetch", spy);
    const r = await coldiqSearchPeople({ job_titles: ["CEO"] });
    expect(r.error).toMatch(/COLDIQ_API_KEY/);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("reading the response envelope", () => {
  // The spec leaves the GTM response body untyped, so this has to survive
  // whichever shape it actually uses.
  it("reads a bare array", () => {
    expect(extractRecords([{ a: 1 }])).toHaveLength(1);
  });

  it("reads the documented envelopes", () => {
    for (const key of ["data", "results", "people", "contacts"]) {
      expect(extractRecords({ [key]: [{ a: 1 }] }), key).toHaveLength(1);
    }
  });

  it("reads one level of nesting", () => {
    expect(extractRecords({ data: { people: [{ a: 1 }] } })).toHaveLength(1);
  });

  it("yields nothing for an envelope it does not recognise, rather than guessing", () => {
    expect(extractRecords({ mystery: { deeply: { nested: [{ a: 1 }] } } })).toHaveLength(0);
    expect(extractRecords(null)).toHaveLength(0);
  });
});
