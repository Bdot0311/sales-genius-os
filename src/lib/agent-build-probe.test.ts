import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CODE = code(AGENT);

/** The markers the deployed function reports, read out of the source. */
const markers = (() => {
  const block = CODE.slice(CODE.indexOf("const AGENT_CHAT_BUILD = ["));
  return [...block.slice(0, block.indexOf("]")).matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
})();

/**
 * Merging is not deploying: edge functions ship through Lovable, so a fix can
 * sit on main for hours while the running function is older. That has been
 * diagnosed the slow way more than once — most recently a chat that said
 * "continuing…" and then stopped, which the merged code cannot do, because it
 * only says that once it has decided to continue.
 *
 * Every marker is checked against the behaviour it claims. A build probe that
 * can drift is worse than no build probe: it would answer "yes, deployed" to
 * the one question it exists to settle.
 */
const CARD = readFileSync("src/components/admin/AgentBuildCard.tsx", "utf8");
const SETTINGS = readFileSync("src/pages/admin/Settings.tsx", "utf8");

describe("the deploy probe answers honestly", () => {
  it("is reachable without a thread, and before any work", () => {
    const at = CODE.indexOf('if (action === "build")');
    expect(at).toBeGreaterThan(-1);
    // Before the thread lookup, so it costs nothing and needs no conversation.
    expect(at).toBeLessThan(CODE.indexOf('if (!threadId) return json('));
    // But after the caller is authenticated: it names internals.
    expect(at).toBeGreaterThan(CODE.indexOf("admin.auth.getUser("));
  });

  it("reports at least one marker", () => {
    expect(markers.length).toBeGreaterThan(5);
  });

  it("claims nothing this file cannot do", () => {
    const evidence: Record<string, string> = {
      // #243
      "continues-a-promised-turn": "statedIntentWithoutAction(",
      // #254
      "releases-run-claim-on-error": "releaseRunClaim?.()",
      "says-when-it-stops-short": "stoppedShortNote",
      "quiet-period-on-awaiting-reply": "quiet_for_days",
      "refuses-delete-and-redraft": "redraft_will_not_help",
      // #257
      "queues-overflow-batches": "const INLINE_DRAFT_LIMIT = 12;",
      // #259
      "asks-for-the-whole-list": "Every lead id to draft for, in ONE call",
    };
    for (const marker of markers) {
      const proof = evidence[marker];
      expect(proof, `${marker} has no evidence listed in this test`).toBeTruthy();
      expect(AGENT, `${marker} is claimed but its code is gone`).toContain(proof);
    }
  });

  it("has evidence for every marker and a marker for every piece of evidence", () => {
    // Otherwise the list quietly stops covering the thing it was added for.
    const evidenceKeys = [
      "continues-a-promised-turn",
      "releases-run-claim-on-error",
      "says-when-it-stops-short",
      "quiet-period-on-awaiting-reply",
      "refuses-delete-and-redraft",
      "queues-overflow-batches",
      "asks-for-the-whole-list",
    ];
    expect([...markers].sort()).toEqual([...evidenceKeys].sort());
  });

  it("the admin card lists exactly the markers the function reports", () => {
    // A card that shows a stale list would answer "not deployed" forever, or
    // quietly stop showing a change that is genuinely missing.
    const listed = [...CARD.matchAll(/marker: "([a-z-]+)"/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual([...markers].sort());
  });

  it("the card is somewhere it can be read", () => {
    expect(SETTINGS).toContain("<AgentBuildCard />");
  });

  it("treats a deployment with no build branch as the answer, not an error", () => {
    // An older function falls through to the missing-threadId error, and that
    // is itself informative: nothing below it is running.
    expect(CARD).toContain("predates the probe");
    expect(CARD).toContain("Array.isArray(build) ? build : []");
  });
});
