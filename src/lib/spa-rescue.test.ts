import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coldiqFetchPages } from "../../supabase/functions/_shared/coldiq.ts";
import { readFileSync } from "node:fs";

const RESEARCH = readFileSync(
  new URL("../../supabase/functions/research-lead/index.ts", import.meta.url),
  "utf8",
);
const setEnv = (e: Record<string, string>) =>
  ((globalThis as unknown as { Deno: unknown }).Deno = { env: { get: (k: string) => e[k] } });

beforeEach(() => setEnv({ COLDIQ_API_KEY: "k" }));
afterEach(() => vi.unstubAllGlobals());

/**
 * Grounding sat near one lead in five. The research was not weak — for a
 * single-page app the served HTML is an empty root div plus bundles, so
 * stripping <script> leaves no prose at all. Most startup marketing sites are
 * SPAs, which is most of an AI-startup ICP.
 */
describe("rescuing text from a page we could not read", () => {
  it("returns the extracted text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ text: "We build warehouse robots for cold storage." }] }), { status: 200 })));
    const r = await coldiqFetchPages(["https://acme.com"]);
    expect(r.text).toContain("warehouse robots");
  });

  it("reads whichever field the extraction used", async () => {
    for (const key of ["text", "content", "extracted_text", "markdown"]) {
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ [key]: "a".repeat(60) }] }), { status: 200 })));
      expect((await coldiqFetchPages(["https://acme.com"])).text.length).toBeGreaterThan(40);
    }
  });

  it("asks for text rather than a summary", async () => {
    const spy = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal("fetch", spy);
    await coldiqFetchPages(["https://acme.com"]);
    expect(JSON.parse(String((spy.mock.calls[0][1] as RequestInit).body)).input.include_text).toBe(true);
  });

  it("does nothing without urls or a key", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect((await coldiqFetchPages([])).text).toBe("");
    setEnv({});
    expect((await coldiqFetchPages(["https://acme.com"])).text).toBe("");
    expect(spy).not.toHaveBeenCalled();
  });

  it("leaves research on the direct scrape when it fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const r = await coldiqFetchPages(["https://acme.com"]);
    expect(r.text).toBe("");
    expect(r.error).toContain("500");
  });
});

describe("where the rescue sits in research-lead", () => {
  it("only fires when the direct read came back thin", () => {
    // A site we could already read must never cost a credit.
    expect(RESEARCH).toContain("if (bodyText.length < 400 && coldiqConfigured())");
  });

  it("runs before the empty-content bail-out", () => {
    // The emptiest SPAs return zero text; if the bail-out came first they
    // would be the exact pages that never got rescued.
    const rescue = RESEARCH.indexOf("Rescue a page our own scraper could not read");
    const bail = RESEARCH.indexOf("empty_content");
    expect(rescue).toBeGreaterThan(-1);
    expect(rescue).toBeLessThan(bail);
  });

  it("only replaces the text when the rescue found more", () => {
    expect(RESEARCH).toContain("rescued.length > bodyText.length");
  });

  it("feeds the rescued text into what the model reads", () => {
    expect(RESEARCH).toContain("EXTRACTED TEXT");
  });
});
