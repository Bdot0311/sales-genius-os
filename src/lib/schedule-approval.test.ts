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
 * No row in the database had ever carried a scheduled_at while the approvals
 * table filled up: scheduling was the one send path that bypassed approval, so
 * in approval mode the model followed the mode instruction into send_drafts
 * instead and the requested time was dropped.
 *
 * The queue is gone now, and the guarantee is the same one restated: scheduling
 * respects approval mode, and it does so by reporting what would be queued
 * rather than by parking a row.
 */
describe("scheduling honours approval mode without a queue", () => {
  it("sends nothing on an unconfirmed call", () => {
    expect(scheduleCase).toMatch(/if \(!autonomous && args\.confirmed !== true\)/);
    expect(scheduleCase).toContain("awaiting_confirmation: true");
  });

  it("hands back the exact time it would use, so the user confirms a real plan", () => {
    expect(scheduleCase).toContain("would_send_at_local");
    expect(scheduleCase).toContain("would_send_at");
  });

  it("writes nothing anywhere while unconfirmed", () => {
    const preview = scheduleCase.slice(
      scheduleCase.indexOf("args.confirmed !== true"),
      scheduleCase.indexOf("index++;", scheduleCase.indexOf("args.confirmed !== true")),
    );
    expect(preview).not.toContain(".insert(");
    expect(preview).not.toContain("agent_approvals");
  });

  it("tells the model to come back with confirmed rather than to resolve a queue", () => {
    expect(scheduleCase).toContain("confirmed: true");
    expect(scheduleCase).not.toContain("resolve_approvals");
  });

  it("still schedules for real once confirmed", () => {
    expect(scheduleCase).toContain('status: "scheduled"');
    expect(scheduleCase).toContain("scheduled_at");
  });
});
