import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync(
  new URL("../../supabase/functions/agent-chat/index.ts", import.meta.url),
  "utf8",
);

const scheduleCase = SRC.slice(
  SRC.indexOf('case "schedule_drafts"'),
  SRC.indexOf('case "list_scheduled_emails"'),
);

/**
 * No row in the database has ever carried a scheduled_at, and no
 * outreach_scheduled action has ever been written — while the approvals table
 * filled up with 37 pending rows. Scheduling was the one send path that
 * bypassed approval, so in approval mode the model followed the mode
 * instruction into send_drafts instead, and the requested time was dropped.
 */
describe("scheduling pauses like every other send", () => {
  it("parks an approval instead of writing straight to sent_emails", () => {
    expect(scheduleCase).toContain('.from("agent_approvals")');
    expect(scheduleCase).toContain("if (!autonomous) {");
  });

  it("attaches the send time to the approval", () => {
    // Without this the time is lost and approving sends immediately.
    expect(scheduleCase).toContain("scheduled_at: sendAt.toISOString()");
    expect(scheduleCase).toContain("sending_account_id: mailbox.sendingAccountId ?? null");
  });

  it("only writes sent_emails directly in full autonomy", () => {
    const gate = scheduleCase.indexOf("if (!autonomous) {");
    const insert = scheduleCase.indexOf('.from("sent_emails").insert(');
    expect(gate).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(gate);
  });

  it("reports queued-for-approval rather than scheduled", () => {
    expect(scheduleCase).toContain("queued_for_approval: queuedCount");
    expect(scheduleCase).toContain("Nothing is scheduled yet");
  });

  it("does not claim 'Scheduled email' in the UI when nothing was scheduled", () => {
    expect(scheduleCase).toContain("if (!queuedCount) {");
  });
});

describe("approving a scheduled request schedules it", () => {
  const applyApproval = SRC.slice(
    SRC.indexOf("const applyApproval = async"),
    SRC.indexOf('} else if (approval.kind === "enrollment")'),
  );

  it("reads the send time off the approval", () => {
    expect(applyApproval).toContain("(approval.metadata ?? {}).scheduled_at");
  });

  it("inserts a scheduled row rather than calling send-email", () => {
    const branch = applyApproval.indexOf("scheduledAt.getTime() > Date.now()");
    const insert = applyApproval.indexOf('status: "scheduled"');
    const send = applyApproval.indexOf('await callFn("send-email"');
    expect(branch).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(branch);
    expect(send).toBeGreaterThan(insert);
  });

  it("ignores a time that has already passed and sends normally", () => {
    // A stale approval should still go out, not silently schedule into the past.
    expect(applyApproval).toContain("scheduledAt.getTime() > Date.now()");
  });

  it("writes the outreach_scheduled action that was never once recorded", () => {
    expect(applyApproval).toContain('action_type: "outreach_scheduled"');
  });

  it("returns the same shape as the send path", () => {
    expect(SRC.match(/return \{ outcome, failed, status \};/g)?.length).toBe(2);
  });

  it("leaves the approval pending when the insert fails, so it can be retried", () => {
    expect(applyApproval).toContain('const status = failed ? "pending" : "approved";');
  });
});

describe("the model is told scheduling still works in approval mode", () => {
  it("says so in the mode instructions", () => {
    expect(SRC).toContain("Scheduling still works: call schedule_drafts as normal");
  });

  it("no longer tells the model to pass a bare ISO send_at", () => {
    // The tool description contradicted the SCHEDULING rules, which say to pass
    // send_at_local and let the tool do the conversion.
    expect(SRC).not.toContain("call schedule_drafts with those draft_ids and an ISO send_at");
  });
});
