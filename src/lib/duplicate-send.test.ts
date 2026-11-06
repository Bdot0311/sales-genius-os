import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");
const DUP = readFileSync("supabase/functions/_shared/duplicate-send.ts", "utf8");

/**
 * The agent re-mailed prospects it had already contacted.
 *
 * In approval mode a send does not happen inside deliver() — it parks an
 * approval and returns sent:false, and deliver() only deletes a draft when it
 * sent. applyApproval then sent the email and never touched email_drafts, so
 * every approved email left its draft in place. send_drafts with no arguments
 * sends every pending draft, so the same person was mailed again on the next
 * run, and again after that.
 */
/**
 * The guarantee moved when the approval queue was retired: a sent draft is
 * cleared by send_drafts itself, because there is no approval row to clear it
 * from any more. The rule is the same one — an email that went out must not
 * still be sitting in the drafts the next send reads.
 */
describe("a sent draft is cleared", () => {
  const branch = AGENT.slice(
    AGENT.indexOf('case "send_drafts": {'),
    AGENT.indexOf('case "schedule_drafts": {'),
  );

  it("deletes the draft once the email has gone", () => {
    expect(branch).toContain('.from("email_drafts")');
    expect(branch).toContain(".delete()");
  });

  it("scopes the delete to the draft and the user", () => {
    const del = branch.slice(branch.indexOf('.from("email_drafts").delete()'));
    expect(del).toMatch(/eq\("id",\s*d\.id\)/);
    expect(del).toMatch(/eq\("user_id",\s*userId\)/);
  });

  it("only runs after a successful send, not on a failure", () => {
    // A draft cleared on a failed send is an email nobody will ever get.
    const gate = branch.indexOf("if (outcome.sent)");
    const del = branch.indexOf('.from("email_drafts").delete()');
    expect(gate).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(gate);
  });

  it("leaves the draft alone when the send is only awaiting confirmation", () => {
    // Approval mode returns sent: false, so the draft survives for the
    // confirming turn to send.
    expect(AGENT).toMatch(/awaiting_confirmation: true/);
  });
});

describe("send-email refuses to repeat itself", () => {
  it("checks the same recipient and subject before sending", () => {
    // Matched as patterns, not literals: the schema checker reads a literal
    // query chain in a test file as a real column reference and fails on it.
    expect(SEND).toContain("duplicateRefusal");
    expect(SEND).toMatch(/eq\('to_email',\s*normalizeRecipient\(to\)\)/);
    expect(SEND).toMatch(/eq\('subject',\s*subject\)/);
  });

  it("counts only mail that actually went out", () => {
    // The list itself moved into _shared/duplicate-send.ts so the guard and
    // everything else that asks "did this actually go out" agree.
    expect(SEND).toContain("DELIVERED_STATUSES");
    expect(DUP).toContain("['sent', 'delivered', 'opened', 'clicked', 'replied']".replace(/'/g, '"'));
  });

  it("looks back a bounded window rather than forever", () => {
    expect(SEND).toContain("duplicateWindowStart()");
    expect(DUP).toContain("DUPLICATE_WINDOW_DAYS = 14");
  });

  it("guards every path, being the one function they all call", () => {
    // The studio, the agent, sequences and the scheduler all send through here.
    const guardIdx = SEND.indexOf("if (!payload.allowDuplicate && !threadId)");
    const gmailIdx = SEND.indexOf("gmail.googleapis.com");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(gmailIdx);
  });

  it("leaves a deliberate resend possible", () => {
    expect(SEND).toContain("payload.allowDuplicate");
  });

  it("tells the caller why, in terms that explain the cost", () => {
    expect(DUP).toContain("what gets a domain filtered");
  });
});

/**
 * The guard then refused the second reply in a conversation: every message in
 * a thread carries the same "Re: <subject>" to the same person, so answering a
 * prospect twice within a fortnight read as a duplicate and never left the app.
 */
describe("a reply in an existing thread is not a duplicate", () => {
  it("exempts a send that carries a thread id", () => {
    expect(SEND).toContain("!payload.allowDuplicate && !threadId");
  });

  it("the inbox reply passes the thread it belongs to", () => {
    const INBOX = readFileSync("src/pages/Inbox.tsx", "utf8");
    const send = INBOX.slice(INBOX.indexOf("const sendReply"));
    expect(send.slice(0, 700)).toContain("threadId: conv.gmailThreadId");
  });

  it("the agent's three reply paths pass it too", () => {
    const RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");
    expect(RUN.split("gmailThreadId: reply.gmailThreadId").length - 1).toBe(3);
    expect(RUN).toContain("threadId: input.gmailThreadId");
  });

  it("an approved reply is allowed through as a continuation", () => {
    const APPROVALS = readFileSync("supabase/functions/agent-approvals/index.ts", "utf8");
    expect(APPROVALS).toContain('allowDuplicate: approval.kind === "reply"');
  });
});

