import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CLAIM_RULES,
  MUTATION_TOOLS,
  READ_ONLY_TOOLS,
  anyMutationSucceeded,
  correctionFor,
  emptyTurnWarning,
  statedIntentWithoutAction,
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
describe("the autonomous path reports receipts, not model prose", () => {
  const RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");

  it("builds its summary from tool receipts", () => {
    expect(RUN).toContain("buildAgentRunSummary(");
    expect(RUN).not.toContain("receiptsFromRun(");
  });

  it("only counts a send after the send call succeeded", () => {
    const gate = RUN.indexOf("classifyProviderSend(");
    const counter = RUN.indexOf("outreachSent++");
    expect(gate).toBeGreaterThan(-1);
    expect(counter).toBeGreaterThan(gate);
    const replyGate = RUN.indexOf('if (replyStatus !== "ok")');
    const replyCounter = RUN.indexOf("repliesSent++");
    expect(replyGate).toBeGreaterThan(-1);
    expect(replyCounter).toBeGreaterThan(replyGate);
  });

  it("distinguishes approval mode from autonomous in what it claims", () => {
    const summary = readFileSync("supabase/functions/_shared/run-receipts.ts", "utf8");
    expect(summary).toMatch(/waiting for your approval/i);
    expect(summary).toContain('delivered("send_outreach")');
    expect(RUN).toContain("buildAgentRunSummary(");
  });
});

/**
 * From a real transcript, two turns apart:
 *
 *   "✅ All Clear: 103 Approvals Rejected & 21 Fresh Follow-Ups Ready"
 *   "✅ 21 Follow-Ups Scheduled for Friday, September 5th at 9:00 AM EST"
 *
 * The first drew a correction that was arguably wrong. The second drew none at
 * all — and the drafts were still sitting in the Drafts tab, which scheduling
 * deletes on success, so nothing had happened.
 */
describe("the phrasings that got through", () => {
  it("catches a headline that says scheduled without saying 'is scheduled'", () => {
    const claims = unbackedClaims("21 Follow-Ups Scheduled for Friday at 9:00 AM EST", []);
    expect(claims.map((c) => c.id)).toContain("scheduled");
  });

  it("catches 'will send automatically tomorrow'", () => {
    expect(unbackedClaims("They will send automatically tomorrow morning.", []).map((c) => c.id))
      .toContain("scheduled");
  });

  it("counts deleting drafts as a real way to clear what is pending", () => {
    // The approval queue is retired; drafts are the pending state, so clearing
    // them is what "clear the queue" now means. A false alarm on a genuine
    // clearance costs the guard its credibility faster than a miss does.
    const cleared = { name: "delete_drafts", label: "Deleted drafts", status: "ok" };
    expect(unbackedClaims("I've cleared all the pending drafts.", [cleared])).toEqual([]);
    expect(unbackedClaims("103 drafts deleted.", []).map((c) => c.id)).toContain("deleted");
  });
});

/**
 * Patterns are precise and will always have holes. The backstop reads no words
 * at all — it asks whether the turn changed anything.
 */
describe("a completion claim on a turn that changed nothing", () => {
  const readOnly = [
    { name: "list_pending_approvals", label: "Listed approvals", status: "ok", detail: "103 waiting" },
    { name: "list_drafts", label: "Listed drafts", status: "ok", detail: "21 drafts" },
  ];

  it("flags it however the reply is worded", () => {
    const warning = emptyTurnWarning("✅ All set — everything is handled.", readOnly);
    expect(warning).toContain("Nothing on this turn changed anything");
    expect(warning).toContain("list_pending_approvals");
    expect(warning).toContain("103 waiting");
  });

  it("says so plainly when no tool ran at all", () => {
    // Was asserting "no tool was called at all, so nothing above happened".
    // The second half was false whenever a background run was still going.
    expect(emptyTurnWarning("✅ Successfully completed.", []))
      .toContain("No tool was called on this turn");
  });

  it("stays quiet when the turn actually did something", () => {
    const sent = [{ name: "send_drafts", label: "Sent email", status: "ok" }];
    expect(emptyTurnWarning("✅ All sent successfully.", sent)).toBe("");
  });

  it("counts queued work as having changed something", () => {
    // In approval mode, parking an approval IS the outcome of the turn.
    const queued = [{ name: "send_drafts", label: "Waiting for your approval", status: "queued" }];
    expect(emptyTurnWarning("✅ All set — 12 are waiting on you.", queued)).toBe("");
  });

  it("stays quiet on a reply that claims nothing", () => {
    expect(emptyTurnWarning("Here are the 21 drafts. Want them sent?", readOnly)).toBe("");
  });

  it("knows reading is not doing", () => {
    expect(anyMutationSucceeded(readOnly)).toBe(false);
    expect(anyMutationSucceeded([{ name: "draft_outreach", status: "ok" }])).toBe(true);
  });

  it("does not count a failed mutation as a change", () => {
    const failed = [{ name: "send_drafts", label: "Send failed", status: "error" }];
    expect(anyMutationSucceeded(failed)).toBe(false);
    expect(emptyTurnWarning("✅ Done.", failed)).toContain("changed anything");
  });
});

/**
 * The stall: "Redrafting Den clean now, then sending all 4. One moment." —
 * and then nothing. No tool called, turn over, user waiting on work the agent
 * already said it was doing, and no way forward but sending another message.
 *
 * emptyTurnWarning cannot see it. Every marker it carries is past tense, and
 * this failure is entirely future tense.
 */
describe("a turn that promised work and did none", () => {
  const nothingRan: ToolEventLike[] = [];

  it("catches the stall that started this", () => {
    expect(
      statedIntentWithoutAction("Redrafting Den clean now, then sending all 4.\nOne moment.", nothingRan),
    ).not.toBe("");
  });

  it("catches the fillers people write while starting work", () => {
    for (const text of [
      "One moment.",
      "On it.",
      "Working on it.",
      "Hang on, pulling those up.",
      "Give me a second.",
      "Starting now.",
      "Sending all four now.",
    ]) {
      expect(statedIntentWithoutAction(text, nothingRan), text).not.toBe("");
    }
  });

  it("leaves a turn that is waiting on the user alone", () => {
    // This is the message directly above the stall in the same conversation.
    // Re-prompting it would talk the agent into sending emails nobody approved,
    // which is worse than the stall it is trying to fix.
    for (const text of [
      'Reply "yes" or "send them" and I\'ll send.',
      "Want me to send these now?",
      "Should I schedule them for 9am?",
      "Let me know once you've connected Gmail and I'll send.",
      "I can send them once you approve.",
    ]) {
      expect(statedIntentWithoutAction(text, nothingRan), text).toBe("");
    }
  });

  it("does not mistake a blocker for a stall", () => {
    // "I'll" on its own is how a model explains what is in the way.
    for (const text of [
      "I'll need your Gmail connected before I can send anything.",
      "That would need a sequence, which this plan does not include.",
      "Here are the 12 leads I found.",
    ]) {
      expect(statedIntentWithoutAction(text, nothingRan), text).toBe("");
    }
  });

  it("says nothing when the turn actually did the work", () => {
    const sent: ToolEventLike[] = [{ name: "send_drafts", label: "Sent", status: "ok" }];
    expect(statedIntentWithoutAction("Sending all four now. One moment.", sent)).toBe("");
  });
});

describe("the chat loop continues a promised turn", () => {
  const CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

  it("checks for a promise as well as for a false completion", () => {
    expect(CHAT).toContain("statedIntentWithoutAction(finalText, toolEvents)");
    expect(CHAT).toContain("claimedDone || promisedWork");
  });

  it("still only intervenes once, whichever of the two it was", () => {
    // A model that will not act on the second ask will not act on the fifth,
    // and looping burns the user's budget to arrive at the same place.
    expect(CHAT).toContain("!retriedEmptyTurn &&");
    expect(CHAT).toContain("retriedEmptyTurn = true");
  });

  it("tells the model it stalled, not that it lied about finishing", () => {
    expect(CHAT).toContain("You said you were starting that work");
    expect(CHAT).toContain("do not promise it again");
    expect(CHAT).toContain("Do not restate the summary you just wrote");
  });
});


import { TOOL_CATALOG } from "../../supabase/functions/_shared/agent-tool-scope.ts";

/*
 * The backstop asks one question -- did this turn do anything? -- and
 * MUTATION_TOOLS is the whole of its answer. So a tool missing from it is a
 * turn that did real work being told "nothing above happened".
 *
 * Twenty-three were missing when this was written, among them every bulk-run
 * tool (the path a 133-lead ask takes) and `run_full_agent`, which runs the
 * entire cycle. The set instead held "run_agent", a name that appears nowhere
 * else in the repository, so it could never match anything.
 *
 * A missing name is silent in both directions: no type error, no failing
 * test, and the symptom reaches the user as a warning contradicting work that
 * actually happened. These two tests are the only thing that can catch it, so
 * they are exhaustive rather than illustrative.
 */
describe("every agent tool is classified", () => {
  const catalog = Object.keys(TOOL_CATALOG);

  it("leaves no tool unclassified", () => {
    const unclassified = catalog
      .filter((name) => !MUTATION_TOOLS.has(name) && !READ_ONLY_TOOLS.has(name))
      .sort();
    expect(
      unclassified,
      `Add each to MUTATION_TOOLS (it does a job the agent can claim credit for) `
      + `or READ_ONLY_TOOLS (it only looks) in _shared/claim-check.ts.`,
    ).toEqual([]);
  });

  it("classifies no tool that does not exist", () => {
    // "run_agent" sat in the set for as long as it took to write this test.
    const ghosts = [...MUTATION_TOOLS, ...READ_ONLY_TOOLS]
      .filter((name) => !catalog.includes(name))
      .sort();
    expect(ghosts, "Names here must match TOOL_CATALOG exactly.").toEqual([]);
  });

  it("counts a turn that only started a bulk run as having done something", () => {
    /*
     * A big ask does not draft in the chat turn, it creates a run. That is
     * the one path where the backstop firing is most damaging, because the
     * turn genuinely cannot show per-lead results yet.
     */
    expect(anyMutationSucceeded([ok("start_bulk_run", "Bulk run")])).toBe(true);
    expect(emptyTurnWarning("All set — the run is queued. ✅", [ok("start_bulk_run", "Bulk run")])).toBe("");
  });

  it("counts a turn that ran the whole agent cycle", () => {
    expect(anyMutationSucceeded([ok("run_full_agent", "Full cycle")])).toBe(true);
  });

  it("still warns when the turn only read", () => {
    const warning = emptyTurnWarning("All done, everything is sent. ✅", [ok("list_leads", "Leads")]);
    expect(warning).toContain("Nothing on this turn changed anything");
    expect(warning).toContain("list_leads");
  });
});


describe("a turn that hands back is not a turn that lied", () => {
  /*
   * This reached a user, with the warning printed above the sentence that
   * caused it:
   *
   *   ⚠️ Nothing ran on this turn — no tool was called at all, so nothing
   *      above happened.
   *   The drafts are all queued and generating in the background... Reply
   *   here when you're ready to send or schedule them.
   *
   * The model had handed 104 drafts to the background queue on an earlier
   * turn and correctly called nothing on this one. "ready to send" is a
   * completion marker, and "you're ready to send" contains it -- so the
   * reader being ready read as the work being finished.
   */
  const HANDBACK =
    "The drafts are all queued and generating in the background — no further tool calls are needed "
    + "from me at this stage. Once the background queue finishes, all 113 will appear in your drafts "
    + "folder. Reply here when you're ready to send or schedule them.";

  it("says nothing when the turn is waiting on the user", () => {
    expect(emptyTurnWarning(HANDBACK, [])).toBe("");
  });

  it("still fires when the drafts themselves are called ready", () => {
    // The work being ready is a completion claim. The reader being ready is not.
    expect(emptyTurnWarning("All 32 drafts are ready to send.", [])).not.toBe("");
  });

  it("is not fooled by a hand-back bolted onto a real claim", () => {
    expect(emptyTurnWarning("Done ✅ — let me know when you're ready to send.", [])).not.toBe("");
  });

  it("claims only what it can know, which is this turn", () => {
    /*
     * "so nothing above happened" was false whenever a background run was
     * live: the progress line above it is the owner watching that run.
     */
    const warning = emptyTurnWarning("All 32 drafts are ready to send.", []);
    expect(warning).toContain("nothing new was started here");
    expect(warning).not.toContain("nothing above happened");
  });
});
