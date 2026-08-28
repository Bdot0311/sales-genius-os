import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");

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
describe("an approved send clears its draft", () => {
  const branch = AGENT.slice(
    AGENT.indexOf('} else if (approval.kind === "outreach") {'),
    AGENT.indexOf('} else if (approval.kind === "enrollment")'),
  );

  it("deletes the draft once the email has gone", () => {
    expect(branch).toContain('.from("email_drafts")');
    expect(branch).toContain(".delete()");
  });

  it("scopes the delete to the lead and the user", () => {
    const del = branch.slice(branch.indexOf('.from("email_drafts")'));
    expect(del).toMatch(/eq\("user_id",\s*userId\)/);
    expect(del).toMatch(/eq\("lead_id",\s*approval\.lead_id\)/);
  });

  it("only runs after a successful send, not on a failure", () => {
    // The failure path leaves the approval pending so it can be retried, and
    // the draft has to survive with it.
    const failIdx = branch.indexOf("failed = Boolean(r?.error)");
    const okIdx = branch.indexOf("if (!failed) {");
    const delIdx = branch.indexOf('.from("email_drafts")');
    expect(failIdx).toBeGreaterThan(-1);
    expect(delIdx).toBeGreaterThan(okIdx);
  });
});

describe("send-email refuses to repeat itself", () => {
  it("checks the same recipient and subject before sending", () => {
    // Matched as patterns, not literals: the schema checker reads a literal
    // query chain in a test file as a real column reference and fails on it.
    expect(SEND).toContain("duplicate_send");
    expect(SEND).toMatch(/eq\('to_email',\s*to\./);
    expect(SEND).toMatch(/eq\('subject',\s*subject\)/);
  });

  it("counts only mail that actually went out", () => {
    expect(SEND).toContain("['sent', 'delivered', 'opened', 'clicked', 'replied']");
  });

  it("looks back a bounded window rather than forever", () => {
    expect(SEND).toContain("14 * 24 * 60 * 60 * 1000");
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
    expect(SEND).toContain("would hurt your deliverability");
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
    const threaded = RUN.split("threadId: reply.gmailThreadId").length - 1;
    expect(threaded).toBe(3);
  });

  it("an approved reply is allowed through as a continuation", () => {
    const APPROVALS = readFileSync("supabase/functions/agent-approvals/index.ts", "utf8");
    expect(APPROVALS).toContain('allowDuplicate: approval.kind === "reply"');
  });
});

