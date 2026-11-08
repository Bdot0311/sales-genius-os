import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DIALOG = readFileSync("src/components/dashboard/LeadAssignmentDialog.tsx", "utf8");
const FN = readFileSync("supabase/functions/notify-lead-assignment/index.ts", "utf8");

describe("lead assignment notice", () => {
  it("is not routed through the outreach send gate", () => {
    expect(DIALOG).not.toContain('invoke("send-email"');
    expect(DIALOG).toContain('invoke("notify-lead-assignment"');
  });
  it("only emails an active member of the caller's own team", () => {
    expect(FN).toContain('.eq("team_owner_id", user.id)');
    expect(FN).toContain('.eq("status", "active")');
  });
});
