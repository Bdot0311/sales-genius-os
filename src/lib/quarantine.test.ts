import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  planRedistribution,
  quarantineReason,
  redistributionSummary,
  shouldQuarantine,
  type QuarantineCandidate,
} from "../../supabase/functions/_shared/quarantine.ts";

const failing: QuarantineCandidate = {
  id: "a", email: "a@x.com", score: 41, threshold: 60,
  status: "active", sentToday: 20, dailyLimit: 100,
};

describe("when a mailbox gets pulled", () => {
  it("pulls one that has fallen below the threshold", () => {
    expect(shouldQuarantine(failing, true)).toBe(true);
  });

  it("respects the user turning containment off", () => {
    // Silently changing someone's sending after they opted out is worse than
    // not containing at all.
    expect(shouldQuarantine(failing, false)).toBe(false);
  });

  it("never pulls a mailbox with no score yet", () => {
    // null is "not enough data", not "bad" — otherwise every mailbox gets
    // quarantined the moment it connects.
    expect(shouldQuarantine({ ...failing, score: null }, true)).toBe(false);
  });

  it("does not re-pull a mailbox already out of rotation", () => {
    expect(shouldQuarantine({ ...failing, status: "paused" }, true)).toBe(false);
  });

  it("leaves a healthy mailbox alone", () => {
    expect(shouldQuarantine({ ...failing, score: 88 }, true)).toBe(false);
    // Exactly at the threshold is not below it.
    expect(shouldQuarantine({ ...failing, score: 60 }, true)).toBe(false);
  });
});

/**
 * The rule that matters: capacity only moves into headroom that already exists.
 * Raising a healthy mailbox's limit to absorb a failing one is how a reputation
 * problem spreads across a whole rotation — the exact thing this prevents.
 */
describe("redistribution never raises anyone's limit", () => {
  it("moves only what healthy mailboxes can already take", () => {
    const plan = planRedistribution(failing, [
      { id: "b", email: "b@x.com", headroom: 30 },
      { id: "c", email: "c@x.com", headroom: 20 },
    ]);
    expect(plan.strandedVolume).toBe(80);   // 100 limit - 20 sent
    expect(plan.absorbed).toBe(50);         // 30 + 20, and not a send more
    expect(plan.unabsorbed).toBe(30);
  });

  it("reports what will not go out rather than hiding it", () => {
    const plan = planRedistribution(failing, []);
    expect(plan.absorbed).toBe(0);
    expect(plan.unabsorbed).toBe(80);
    expect(redistributionSummary(plan)).toMatch(/could not be moved/i);
  });

  it("fills the largest headroom first", () => {
    // Topping every mailbox up to its ceiling would push the whole rotation to
    // its limit at once and read as a volume spike.
    const plan = planRedistribution({ ...failing, dailyLimit: 40, sentToday: 0 }, [
      { id: "small", email: "s@x.com", headroom: 5 },
      { id: "big", email: "b@x.com", headroom: 100 },
    ]);
    expect(plan.destinations).toHaveLength(1);
    expect(plan.destinations[0].id).toBe("big");
    expect(plan.destinations[0].volume).toBe(40);
  });

  it("ignores mailboxes with no room left", () => {
    const plan = planRedistribution(failing, [
      { id: "full", email: "f@x.com", headroom: 0 },
      { id: "ok", email: "o@x.com", headroom: 10 },
    ]);
    expect(plan.destinations.map((d) => d.id)).toEqual(["ok"]);
  });

  it("handles a mailbox that had already sent its full day", () => {
    const plan = planRedistribution({ ...failing, sentToday: 100 }, [
      { id: "b", email: "b@x.com", headroom: 50 },
    ]);
    expect(plan.strandedVolume).toBe(0);
    expect(plan.destinations).toEqual([]);
    expect(redistributionSummary(plan)).toMatch(/No sends were scheduled/i);
  });
});

describe("what the log and the user are told", () => {
  it("gives a reason a person can read, not a status code", () => {
    const reason = quarantineReason(failing);
    expect(reason).toContain("41");
    expect(reason).toContain("60");
    expect(reason).toMatch(/dragged down/i);
  });

  it("summarises a clean move", () => {
    const plan = planRedistribution(failing, [{ id: "b", email: "b@x.com", headroom: 200 }]);
    expect(redistributionSummary(plan)).toBe("80 sends moved to 1 healthy mailbox.");
  });

  it("summarises a partial move honestly", () => {
    const plan = planRedistribution(failing, [{ id: "b", email: "b@x.com", headroom: 10 }]);
    expect(redistributionSummary(plan)).toMatch(/10 of 80 .* 70 will not go out today/);
  });
});

/**
 * An automatic change to someone's sending is only acceptable with a record.
 */
describe("the reputation job records what it did", () => {
  const SRC = readFileSync("supabase/functions/compute-reputation/index.ts", "utf8");

  it("writes a log row for every quarantine", () => {
    expect(SRC).toMatch(/from\("mailbox_quarantine_log"\)\.insert/);
    expect(SRC).toMatch(/action: "quarantined"/);
  });

  it("puts it on the timeline too", () => {
    expect(SRC).toMatch(/event_type: "quarantined"/);
  });

  it("reads the user's preference rather than assuming", () => {
    expect(SRC).toMatch(/auto_quarantine_enabled/);
  });

  it("only redistributes into existing headroom", () => {
    // A query for healthy mailboxes must not be followed by a limit increase.
    expect(SRC).toMatch(/headroom: Math\.max\(0, \(h\.daily_limit \?\? 0\) - \(h\.sent_today \?\? 0\)\)/);
    expect(SRC).not.toMatch(/daily_limit: .*\+/);
  });
});

/**
 * Users of every competing tool report the same thing: you only find out
 * something is wrong by going and looking.
 */
describe("the alert scan covers what silently goes wrong", () => {
  const SRC = readFileSync("supabase/functions/deliverability-alerts-scan/index.ts", "utf8");

  it.each([
    ["bounce_rate", /alert_type: "bounce_rate"/],
    ["complaint_rate", /alert_type: "complaint_rate"/],
    ["placement_drop", /alert_type: "placement_drop"/],
    ["mailbox_unavailable", /alert_type: "mailbox_unavailable"/],
  ])("raises %s", (_name, pattern) => {
    expect(SRC).toMatch(pattern);
  });

  it("does not alert on a rate computed from a handful of sends", () => {
    expect(SRC).toMatch(/if \(volume < 50\) continue/);
  });

  it("does not nag about a mailbox the user paused themselves", () => {
    expect(SRC).toMatch(/paused manually/i);
  });

  it("dedupes per mailbox, not just per domain", () => {
    // Deduping on domain alone would hide a second mailbox's problem behind
    // the first one's alert.
    expect(SRC).toMatch(/q = accountId \? q\.eq\("sending_account_id", accountId\)/);
  });
});
