import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const RESEARCH = readFileSync("supabase/functions/research-lead/index.ts", "utf8");
const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const PARALLEL = readFileSync("supabase/functions/_shared/parallel.ts", "utf8");

const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * "Source links kept opening the leads website."
 *
 * They did, and the reason was that the lead's website was the only source
 * there was. research-lead asks Parallel for independent coverage and
 * explicitly excludes the prospect's own domain from it — but the whole call
 * is gated on PARALLEL_API_KEY, and without the key it resolves to an empty
 * result with error "not_configured". Everything downstream then succeeds: a
 * brief is written, saved, and shown, with every source pointing back at the
 * prospect's own site.
 *
 * Nothing said so. That is the defect — the key being unset is a setting.
 */
describe("research says when only the prospect's own site was read", () => {
  it("still asks for coverage the prospect did not write themselves", () => {
    // The point of the external half: their own pages say the same thing to
    // every visitor and almost never carry a date.
    // Raw, not comment-stripped: the stripper mangles the regex literal.
    expect(RESEARCH).toContain("excludeDomains: host ? [host.replace(/^www\\./, \"\")] : []");
  });

  it("the missing key is what produces an empty result", () => {
    expect(code(PARALLEL)).toContain('if (!key) return { results: [], sessionId: null, error: "not_configured" };');
  });

  it("reports whether the external half ran, and why not", () => {
    expect(code(RESEARCH)).toContain("const externalResearch: {");
    expect(code(RESEARCH)).toContain("ran: web.error === null,");
    expect(code(RESEARCH)).toContain('web.error === "not_configured"');
    // Names the setting, so the reader can act on it rather than file a bug.
    expect(RESEARCH).toContain("neither connected web search source is configured");
  });

  it("carries it back to the caller rather than only to the logs", () => {
    // A console.warn nobody reads is how this stayed invisible.
    expect(code(RESEARCH)).toContain("external_research: externalResearch,");
  });

  it("the agent surfaces it in the chat, as a failure", () => {
    // "Researched leads — 12/12 grounded in findings from the prospect's own
    // website" is true and reads as success. This sits next to it.
    expect(code(AGENT)).toContain("external_research: r?.external_research ?? null,");
    expect(code(AGENT)).toContain("(r: any) => r.external_research && r.external_research.ran === false,");
    expect(AGENT).toContain('label: "Only their own website was read"');
    expect(code(AGENT)).toMatch(/label: "Only their own website was read",\s*status: "error"/);
  });
});
