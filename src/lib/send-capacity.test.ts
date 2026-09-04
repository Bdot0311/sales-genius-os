import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  capacityFor,
  shortfallWarning,
  type MailboxCapacity,
} from "../../supabase/functions/_shared/send-capacity.ts";

const mailbox = (over: Partial<MailboxCapacity> = {}): MailboxCapacity => ({
  id: "a", email: "a@x.com", dailyLimit: 50, sentToday: 0, status: "active", ...over,
});

/**
 * A user asked for 32 follow-ups. Eleven sent, twenty-one were refused, and
 * every refusal parked an approval nobody could clear — 103 of them, one doomed
 * batch at a time. Nothing ever asked whether there was room before starting.
 */
describe("how much can actually go out", () => {
  it("adds up what the mailboxes have left", () => {
    const report = capacityFor(
      [mailbox({ id: "a", dailyLimit: 10, sentToday: 4 }), mailbox({ id: "b", dailyLimit: 10, sentToday: 4 })],
      100, 8,
    );
    expect(report.mailboxHeadroom).toBe(12);
    expect(report.available).toBe(12);
    expect(report.boundBy).toBe("mailboxes");
  });

  it("uses the plan cap when that runs out first", () => {
    const report = capacityFor([mailbox({ dailyLimit: 500 })], 20, 18);
    expect(report.available).toBe(2);
    expect(report.boundBy).toBe("account");
  });

  it("ignores mailboxes that cannot send", () => {
    const report = capacityFor(
      [mailbox({ id: "a", dailyLimit: 10 }), mailbox({ id: "b", email: "b@x.com", status: "paused", dailyLimit: 10 })],
      100, 0,
    );
    expect(report.available).toBe(10);
    expect(report.unavailable).toEqual(["b@x.com"]);
  });

  it("names the mailboxes that are spent", () => {
    const report = capacityFor(
      [mailbox({ id: "a", email: "full@x.com", dailyLimit: 4, sentToday: 4 }),
       mailbox({ id: "b", email: "ok@x.com", dailyLimit: 10, sentToday: 1 })],
      100, 5,
    );
    expect(report.exhausted).toEqual(["full@x.com"]);
    expect(report.available).toBe(9);
  });

  it("treats a missing plan limit as unmetered, not as zero", () => {
    // Guessing zero would stop every send on an account whose subscription row
    // has not been written yet. The send path enforces the real cap anyway.
    const report = capacityFor([mailbox({ dailyLimit: 50 })], 0, 0);
    expect(report.available).toBe(50);
  });

  it("reports zero when everything is spent", () => {
    const report = capacityFor([mailbox({ dailyLimit: 4, sentToday: 4 })], 100, 4);
    expect(report.available).toBe(0);
  });
});

describe("what the user is told before the work starts", () => {
  it("stays silent when the whole request fits", () => {
    expect(shortfallWarning(10, capacityFor([mailbox({ dailyLimit: 50 })], 100, 0))).toBe("");
  });

  it("names the ceiling and which limit set it", () => {
    // "Some sends failed" sends a user hunting. "Your mailboxes have 12 left"
    // tells them what to change.
    const report = capacityFor(
      [mailbox({ id: "a", dailyLimit: 10, sentToday: 4 }), mailbox({ id: "b", email: "b@x.com", dailyLimit: 10, sentToday: 4 })],
      100, 8,
    );
    const note = shortfallWarning(32, report);
    expect(note).toContain("12 of the 32");
    expect(note).toMatch(/daily limits on your mailboxes/);
    expect(note).toMatch(/Deliverability page/);
  });

  it("blames the plan when the plan is the constraint", () => {
    expect(shortfallWarning(50, capacityFor([mailbox({ dailyLimit: 500 })], 20, 18)))
      .toMatch(/plan's daily send limit/);
  });

  it("tells someone with no room left to stop rather than to send some", () => {
    const note = shortfallWarning(21, capacityFor([mailbox({ dailyLimit: 4, sentToday: 4 })], 100, 4));
    expect(note).toMatch(/leaves no room/);
    expect(note).toMatch(/retry tomorrow/);
  });
});

describe("the send path asks before it queues", () => {
  const SRC = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

  it("checks capacity before the per-draft loop", () => {
    const check = SRC.indexOf("const capacity = await sendCapacity()");
    const loop = SRC.indexOf("for (const d of drafts as any[])");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(loop);
  });

  it("queues nothing at all when there is no room", () => {
    // Queuing anyway adds another day's approvals to a queue that already
    // cannot drain — which is exactly how the backlog was built.
    expect(SRC).toMatch(/if \(capacity\.available === 0\)/);
    expect(SRC).toMatch(/Nothing was queued or sent/);
  });

  it("surfaces the shortfall to the user, not just to the model", () => {
    expect(SRC).toMatch(/sendFailures\.push\(capacityNote\)/);
  });

  it("does not read a stale counter as today's usage", () => {
    // A mailbox would otherwise look full the morning after a busy day.
    expect(SRC).toMatch(/a\.sent_today_date === today/);
  });
});
