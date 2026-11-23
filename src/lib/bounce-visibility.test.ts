import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { bounceSyncOwner } from "../../supabase/functions/_shared/bounce-sync-owner";
import { leadHasBounce } from "./lead-bounce-status";

const owner = "fdcd1ed6-f1f3-4dd6-8cde-69d917432a45";
describe("bounce ownership and current address", () => {
  it("signed-in callers cannot choose another mailbox owner", () => {
    expect(bounceSyncOwner(false, owner, "another-user")).toBe(owner);
    expect(bounceSyncOwner(false, null, owner)).toBeNull();
  });
  it("scheduled callers must name a valid owner", () => {
    expect(bounceSyncOwner(true, null, owner)).toBe(owner);
    expect(bounceSyncOwner(true, null, undefined)).toBeNull();
    expect(bounceSyncOwner(true, null, "not-an-id")).toBeNull();
  });
  it("only the lead's currently bounced address is marked", () => {
    const sends = [{ lead_id: "lead-1", to_email: "old@example.com" }];
    expect(leadHasBounce({ id: "lead-1", contact_email: "OLD@example.com" }, sends)).toBe(true);
    expect(leadHasBounce({ id: "lead-1", contact_email: "fixed@example.com" }, sends)).toBe(false);
    expect(leadHasBounce({ id: "lead-2", contact_email: "old@example.com" }, sends)).toBe(false);
  });
  it("the leased scheduled sweep runs both readers independently", () => {
    const source = readFileSync("supabase/functions/sync-inboxes/index.ts", "utf8");
    expect(source).toContain('Promise.allSettled(["inbox-sync", "sync-bounces"]');
    expect(source).toContain('rpc("claim_inbox_sync_sweep"');
    expect(source).toContain('rpc("release_inbox_sync_sweep"');
  });
});