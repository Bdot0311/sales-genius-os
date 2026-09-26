import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const VERIFY = readFileSync("supabase/functions/_shared/email-verify.ts", "utf8");
const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");
const SEARCH = readFileSync("supabase/functions/fetch-external-leads/index.ts", "utf8");
const ENRICH = readFileSync("supabase/functions/enrich-lead/index.ts", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const verify = code(VERIFY);

/**
 * Why this file exists.
 *
 * This module talked to ColdIQ directly. ColdIQ was paused for cost, so every
 * address fell through to the free DNS gate -- which proves a domain accepts
 * mail and can never prove a mailbox exists. Nothing came back `invalid`,
 * send-email only refuses `invalid`, and addresses that did not exist shipped:
 * 3 of 35 and 2 of 34 on the two live mailboxes.
 *
 * Fiber, ContactOut and Findymail were configured and answering behind the
 * lead-search service the whole time, reachable through a waterfall that only
 * ran as a side effect of a paid reveal. Nothing here asked them.
 */
describe("the waterfall outranks any single vendor", () => {
  const resolution = verify.split("function providerName()")[1].split("}")[0];

  it("prefers Railway when it is configured", () => {
    expect(resolution).toContain('if (railwayVerifyUrl()) return "railway"');
  });

  it("keeps a direct vendor as the layer beneath, not above", () => {
    // The old order returned on an explicit key first, so setting one would
    // have hidden the waterfall behind it permanently.
    expect(resolution).toContain("return directProviderName()");
    expect(resolution).not.toContain("EMAIL_VERIFIER_API_KEY");
  });

  it("counts a configured Railway as a real verifier", () => {
    // hasPaidVerifier is what tells "inconclusive" apart from "never checked",
    // and the DNS-only branch is chosen on it.
    expect(verify).toContain("return providerName() !== null");
  });

  it("needs no key of its own, because the vendor keys live over there", () => {
    const url = verify.split("function railwayVerifyUrl()")[1].split("\nfunction")[0];
    expect(url).toContain('Deno.env.get("RAILWAY_LEADS_API_URL")');
    expect(url).not.toContain("RAILWAY_API_KEY");
  });

  it("tolerates a base URL that already carries a verb", () => {
    const url = verify.split("function railwayVerifyUrl()")[1].split("\nfunction")[0];
    expect(url).toMatch(/search\|docs\|health\|verify\|enrich/);
    expect(url).toContain('+ "/verify"');
  });
});

describe("a verdict is read by address, never by position", () => {
  it("reads the single answer out of the keyed map", () => {
    const branch = verify.split('if (provider === "railway")')[1].split("} else if")[0];
    expect(branch).toContain("?.results?.[email.trim().toLowerCase()]");
  });

  it("treats a missing key as unproven rather than clean", () => {
    const branch = verify.split('if (provider === "railway")')[1].split("} else if")[0];
    expect(branch).toContain("if (!row)");
    expect(branch).toContain('status: "unknown"');
    expect(branch).toContain("verified: null");
  });

  it("reads each batch answer by name too", () => {
    const batch = verify.split("async function verifyBatchViaRailway")[1].split("\nasync function")[0];
    expect(batch).toContain("const row = rows[email];");
    expect(batch).toContain("if (row === undefined || row === null) continue;");
  });
});

describe("the direct vendor answers when the waterfall cannot be reached", () => {
  const fallback = verify
    .split("async function callProviderWithFallback")[1]
    .split("\n/**")[0];

  it("only retries an inconclusive answer", () => {
    expect(fallback).toContain('if (first.status !== "unknown") return first;');
  });

  it("does not stack a second vendor under a direct vendor", () => {
    // A direct key is already the bottom of the chain; retrying it with itself
    // would just buy the same verdict twice.
    expect(fallback).toContain('providerName() === "railway" ? directProviderName() : null');
  });

  it("keeps the first reason when neither could answer", () => {
    expect(fallback).toContain('return second.status === "unknown" ? first : second;');
  });

  it("covers the batch path too, which is the one that shipped the bounces", () => {
    const bulk = verify.split("export async function verifyEmails")[1];
    expect(bulk).toContain('const backup = bulkProvider === "railway" ? directProviderName() : null;');
    expect(bulk).toContain("needsProvider.filter((e) => !verdicts.has(e))");
    expect(bulk).toContain("Date.now() < deadline");
  });
});

describe("the batch path reaches the waterfall", () => {
  const bulk = verify.split("export async function verifyEmails")[1];

  it("takes the bulk branch for either bulk-capable provider", () => {
    expect(bulk).toContain('(bulkProvider === "railway" || bulkProvider === "coldiq") && queue.length > 1');
  });

  it("sends to the one that is actually configured", () => {
    expect(bulk).toContain('bulkProvider === "railway"');
    expect(bulk).toContain("verifyBatchViaRailway(needsProvider)");
    expect(bulk).toContain("verifyBatchViaColdIq(needsProvider)");
  });

  it("names the provider it asked rather than hardcoding one", () => {
    expect(bulk).toContain("source: bulkProvider,");
    expect(bulk).not.toContain('source: "coldiq",');
  });

  it("still spends nothing on an address the free gate already killed", () => {
    expect(bulk).toContain('if (free?.status === "invalid")');
    expect(bulk).toContain("continue;");
  });
});

describe("the waterfall's vocabulary is understood", () => {
  it("reads the role and disposable flags it reports", () => {
    // Fiber reports role_based and disposable; neither name appears in the
    // direct vendors' schemas, so without these a shared mailbox reads clean.
    expect(verify).toContain("obj.role_based === true");
    expect(verify).toContain("obj.disposable === true");
  });

  it("reads its sendable flag", () => {
    expect(verify).toContain("obj.sendable === true");
  });

  it("knows `unverified` is an answer, not an unrecognised word", () => {
    const interpreted = verify.split("function interpret(")[1].split("\nasync function")[0];
    // It has to fall through the same labels as risky and unknown to the one
    // return they share. Falling to `default` instead would log it as an
    // unrecognised verdict on every address the waterfall could not place.
    const unproven = interpreted
      .split('case "risky":')[1]
      .split("}")[0];
    expect(unproven).toContain('case "unverified":');
    expect(unproven).toContain('status: "unknown"');
    expect(unproven).toContain("verified: null");
    // And the labels above it must be a bare fall-through, not a return that
    // would stop `unverified` ever being reached.
    expect(unproven.split('case "unverified":')[0]).not.toContain("return");
  });
});

/**
 * The rule that made an unverified address dangerous rather than merely
 * unproven. It is deliberately narrow and stays narrow: blocking catch_all and
 * unknown would ground most of a list to prevent a minority of bounces.
 */
describe("what actually gets refused has not widened", () => {
  it("still refuses only a proven-dead mailbox", () => {
    const send = code(SEND);
    expect(send).toContain("leadRow?.email_verification_status === 'invalid'");
    expect(send).toContain("code: 'email_unverifiable'");
  });

  it("is what the upstream verdict maps onto", () => {
    const enrich = code(ENRICH);
    expect(enrich).toContain("undeliverable: 'invalid'");
    expect(enrich).toContain("deliverable: 'valid'");
    expect(enrich).toContain("catch_all: 'catch_all'");
    expect(enrich).toContain("risky: 'unknown'");
  });

  it("covers the search path, which is where the dead addresses came from", () => {
    expect(code(SEARCH)).toContain("await verifyEmails(supabase, emails)");
  });
});
