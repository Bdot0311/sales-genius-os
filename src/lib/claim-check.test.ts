import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CLAIM_RULES,
  correctionFor,
  unbackedClaims,
  type ToolEventLike,
} from "../../supabase/functions/_shared/claim-check.ts";

const ok = (name: string, label = "Sent email"): ToolEventLike => ({ name, label, status: "ok" });

/**
 * A user was told emails had gone out while the approvals table filled with
 * rows nothing had reviewed. The original check caught exactly that phrasing
 * and nothing else, because it was written for one reported failure.
 */
describe("claims with nothing behind them", () => {
  it("catches a send that never ran", () => {
    const claims = unbackedClaims("I've sent all 12 emails.", []);
    expect(claims.map((c) => c.id)).toEqual(["sent"]);
  });

  it("does not correct a send that did run", () => {
    expect(unbackedClaims("I've sent all 12 emails.", [ok("send_drafts")])).toEqual([]);
  });

  it("knows a queued approval is not a send", () => {
    const queued: ToolEventLike = {
      name: "send_drafts", label: "Waiting for your approval", status: "queued",
    };
    expect(unbackedClaims("They have gone out.", [queued]).map((c) => c.id)).toEqual(["sent"]);
  });

  it("knows a scheduled send is not a send either", () => {
    const scheduled: ToolEventLike = {
      name: "schedule_drafts", label: "Scheduled email", status: "ok",
    };
    expect(unbackedClaims("I sent them.", [scheduled]).map((c) => c.id)).toEqual(["sent"]);
    // But it does back a claim of scheduling.
    expect(unbackedClaims("I've scheduled them for Monday.", [scheduled])).toEqual([]);
  });
});

describe("the verbs that used to ship unchecked", () => {
  it.each([
    ["I enriched those 20 leads.", "enriched", "enrich_leads"],
    ["I found 15 prospects at those companies.", "found", "find_leads"],
    ["I've written follow-ups for all of them.", "drafted", "draft_outreach"],
    ["I deleted them.", "deleted", "delete_leads"],
    ["I enrolled them in the sequence.", "enrolled", "enroll_lead_in_sequence"],
    ["Those are scheduled for Monday.", "scheduled", "schedule_drafts"],
  ])("catches %s when nothing ran", (text, id, tool) => {
    expect(unbackedClaims(text, []).map((c) => c.id)).toContain(id);
    expect(unbackedClaims(text, [ok(tool, "done")])).toEqual([]);
  });
});

describe("what it deliberately does not do", () => {
  it("stays silent on a reply that claims nothing", () => {
    expect(unbackedClaims("Here's what I found. Want me to draft something?", [])).toEqual([]);
  });

  it("does not correct under-reporting", () => {
    // Failing to mention work is a worse write-up, not a lie, and correcting it
    // would append noise to every terse reply.
    expect(unbackedClaims("Done.", [ok("send_drafts")])).toEqual([]);
  });

  it("does not fire on a failed tool of the right name", () => {
    const failed: ToolEventLike = { name: "enrich_leads", label: "Enrich failed", status: "error" };
    expect(unbackedClaims("I enriched them.", [failed]).map((c) => c.id)).toEqual(["enriched"]);
  });

  it("handles empty text", () => {
    expect(unbackedClaims("", [])).toEqual([]);
  });
});

describe("the correction that gets appended", () => {
  it("appends rather than rewriting", () => {
    // Silently editing what an agent said hides the failure from whoever has
    // to fix it.
    expect(correctionFor([{ id: "sent", correction: "nothing was actually sent in this step." }]))
      .toBe("Correction: nothing was actually sent in this step.");
  });

  it("joins several claims into one correction", () => {
    const out = correctionFor(unbackedClaims("I enriched them and sent the emails.", []));
    expect(out).toContain("enriched");
    expect(out).toContain("sent");
  });

  it("says nothing when everything checks out", () => {
    expect(correctionFor([])).toBe("");
  });
});

describe("every rule names tools that exist", () => {
  const CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

  it("has no rule pointing at a tool the agent does not have", () => {
    // A rule naming a renamed tool silently stops catching anything.
    for (const rule of CLAIM_RULES) {
      for (const tool of rule.tools) {
        expect(CHAT, `${rule.id} → ${tool}`).toContain(`case "${tool}"`);
      }
    }
  });

  it("is wired into the chat turn", () => {
    expect(CHAT).toMatch(/unbackedClaims\(finalText, toolEvents\)/);
  });
});

/**
 * The audit said agent-run had no verifier. It does not need the same one:
 * its summary is built from counters incremented only after a real send, not
 * written by a model. These assertions are what makes that safe to rely on.
 */
describe("the autonomous path reports counters, not model prose", () => {
  const RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");

  it("builds its summary from counters", () => {
    expect(RUN).toMatch(/const runSummary = approvalMode/);
    expect(RUN).toMatch(/\$\{outreachSent\} first-touch email\(s\) sent/);
  });

  it("only counts a send after the send call succeeded", () => {
    const gate = RUN.indexOf("if (!sendRes.ok || sendData?.error)");
    const counter = RUN.indexOf("outreachSent++");
    expect(gate).toBeGreaterThan(-1);
    expect(counter).toBeGreaterThan(gate);
  });

  it("distinguishes approval mode from autonomous in what it claims", () => {
    expect(RUN).toMatch(/waiting for your approval/i);
  });
});
