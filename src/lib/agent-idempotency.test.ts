import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync(
  new URL("../../supabase/functions/agent-chat/index.ts", import.meta.url),
  "utf8",
);

/**
 * The AI SDR repeated work and misreported what it had done. Four linked
 * causes, each fixed here — these tests pin the fixes because every one of them
 * fails silently: the agent looks like it is working either way.
 */
describe("duplicate email to the same prospect", () => {
  it("replaces a lead's pending draft instead of stacking another", () => {
    // draft_outreach(["a","b"]) then draft_outreach(["b","c"]) left b holding
    // two drafts. The per-request guard misses it: its key is the whole
    // argument object, so any change to the id list is a different key.
    const draftCase = SRC.slice(SRC.indexOf('case "draft_outreach"'), SRC.indexOf('case "draft_sequence"'));
    const del = draftCase.indexOf('.from("email_drafts")\n                .delete()');
    const ins = draftCase.indexOf('.from("email_drafts")\n                .insert(');
    expect(del, "delete-before-insert missing").toBeGreaterThan(-1);
    expect(ins).toBeGreaterThan(del);
    expect(draftCase).toContain('.eq("lead_id", lead.id)');
  });

  it("dedupes per lead when send_drafts is called with no arguments", () => {
    // The no-argument call is the documented "send every pending draft" path,
    // and the one most likely to be holding duplicates — it was the one branch
    // that skipped the dedupe.
    // Both draft-delivery tools, not just send_drafts — schedule_drafts had the
    // identical gap, which delivers the same duplicate, just later.
    const perLead = SRC.split("if (!draftIds.length) {").length - 1;
    expect(perLead, "send_drafts and schedule_drafts must both dedupe").toBe(2);
    expect(SRC).not.toContain("if (!draftIds.length && leadIds.length) {");
  });

  it("keys a send on the recipient, not on the wording", () => {
    // Rewording the body produced a new key, so redraft-then-resend delivered
    // twice — a sequence the quality gate's rewrite path makes likely.
    expect(SRC).toContain('return `send_outreach:recipient:${who}`');
  });
});

describe("recording a send that never happened", () => {
  it("does not mark a rewrite request as completed work", () => {
    expect(SRC).toContain("function didMutate");
    expect(SRC).toContain("summary.needs_rewrite === true) return false");
  });

  it("does not mark an unapproved send as completed work", () => {
    expect(SRC).toContain("summary.queued_for_approval === true) return false");
  });

  it("still treats an explicit error as not-done", () => {
    expect(SRC).toMatch(/if \("error" in r\) return false;/);
  });

  it("gates completion on didMutate rather than on the absence of an error key", () => {
    expect(SRC).toContain("if (mutationKey && didMutate(result)) {");
  });
});

describe("truncated tool results", () => {
  it("never hands the model severed JSON", () => {
    // A model given a record that stops mid-token does not report a truncated
    // record — it infers what the rest probably said.
    // Asserted on the call site rather than the whole file: the helper's own
    // doc comment quotes the old expression to explain what it replaced.
    expect(SRC).toContain("content: serialiseToolResult(result)");
    expect(SRC).not.toContain("content: JSON.stringify(result).slice");
  });

  it("trims structurally and says what it dropped", () => {
    expect(SRC).toContain("truncated_note");
    expect(SRC).toContain("do not assume what they contained");
  });
});
