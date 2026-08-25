import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SYNC = readFileSync("supabase/functions/inbox-sync/index.ts", "utf8");
const ANALYZE = readFileSync("supabase/functions/analyze-reply/index.ts", "utf8");
const INBOX = readFileSync("src/pages/Inbox.tsx", "utf8");
const DEMO = readFileSync("supabase/functions/admin-demo-data/index.ts", "utf8");

/**
 * A real out-of-office arrived in Gmail and appeared nowhere in the product:
 * not in the unified inbox, and never mentioned by the agent that advertises
 * it reads every reply. Two independent causes, both provable from the source.
 */
describe("an auto-reply is recorded, not discarded", () => {
  it("no longer drops the message on the floor", () => {
    // `if (isAutoReply) continue;` ended the story: nothing stored, nothing to
    // show, nothing for the agent to read.
    expect(SYNC).not.toMatch(/if \(isAutoReply\) continue;/);
  });

  it("still detects one from the headers rather than guessing", () => {
    expect(SYNC).toContain('headerValue("auto-submitted")');
    expect(SYNC).toContain('headerValue("x-autoreply")');
    expect(SYNC).toContain("out of (the )?office");
  });

  it("carries the verdict through with the message", () => {
    expect(SYNC).toContain("isAutoReply,");
    expect(SYNC).toContain("isAutoReply: r.isAutoReply");
  });

  it("keeps it out of the reply rate", () => {
    // An out-of-office is not the prospect replying. Stamping replied_at for
    // one would report a reply rate the sender never earned.
    expect(SYNC).toMatch(/if \(r\.isAutoReply\) continue;/);
  });

  it("classifies it deterministically instead of asking a model", () => {
    expect(ANALYZE).toContain("if (isAutoReply) {");
    expect(ANALYZE).toContain("triage_category: 'ooo'");
    expect(ANALYZE).toContain("has_auto_reply: true");
  });

  it("does not let a cheerful auto-reply read as interest", () => {
    expect(ANALYZE).toContain("intent_classification: 'LOW_INTENT'");
    expect(ANALYZE).toContain("requires_human_action: false");
  });
});

describe("the unified inbox reads a table something now writes", () => {
  it("reads reply_threads", () => {
    expect(INBOX).toContain('.from("reply_threads")');
  });

  it("is populated by the real sync, not only by the demo seeder", () => {
    // Before this, the ONLY insert into reply_threads in the whole repo was
    // admin-demo-data's seeder, so the inbox's reply tabs could only ever show
    // demo rows while real replies went to reply_analysis — which the inbox
    // does not read.
    expect(SYNC).toContain('.from("reply_threads").insert(');
    expect(DEMO).toContain('.from("reply_threads").insert(');
  });

  it("writes the columns the inbox actually selects", () => {
    for (const col of ["sender_email", "subject", "reply_body", "classification", "read"]) {
      expect(SYNC, col).toContain(`${col}:`);
    }
  });

  it("marks real rows as not demo, so they survive a demo reset", () => {
    expect(SYNC).toContain("demo_seed: false");
  });

  it("arrives unread so it shows in the Unread tab", () => {
    expect(SYNC).toContain("read: false");
    expect(INBOX).toContain('folder === "unread"');
  });

  it("labels an auto-reply so it can be told apart in the list", () => {
    expect(SYNC).toContain('classification: r.isAutoReply ? "ooo" : null');
  });

  it("selects lead_id, which the insert needs", () => {
    // The threads query did not select it, so it was never available.
    expect(SYNC).toContain("sending_account_id, lead_id");
  });

  it("uses the service-role client, like every other write here", () => {
    expect(SYNC).toContain('adminClient.from("reply_threads")');
    expect(SYNC).not.toContain('supabase.from("reply_threads")');
  });
});
