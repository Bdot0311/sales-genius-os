import { describe, expect, it } from "vitest";
import {
  chooseMailbox,
  isBusinessHours,
  localHour,
  providerOf,
  type RoutableMailbox,
} from "../../supabase/functions/_shared/mailbox-routing.ts";

const mailbox = (over: Partial<RoutableMailbox> = {}): RoutableMailbox => ({
  id: "a", email: "a@acme.com", provider: "google",
  reputationScore: 80, status: "active",
  sentToday: 0, dailyLimit: 50, warmupEnabled: false,
  ...over,
});

describe("reading the recipient", () => {
  it("recognises the big three providers", () => {
    expect(providerOf("x@gmail.com")).toBe("google");
    expect(providerOf("x@outlook.com")).toBe("microsoft");
    expect(providerOf("x@yahoo.co.uk")).toBe("yahoo");
  });

  it("returns null for a corporate domain rather than guessing", () => {
    expect(providerOf("x@acme.com")).toBeNull();
    expect(providerOf("nonsense")).toBeNull();
  });
});

describe("recipient local time", () => {
  const noonUtc = new Date("2026-09-02T12:00:00Z");

  it("converts to the recipient's zone", () => {
    expect(localHour("UTC", noonUtc)).toBe(12);
    expect(localHour("America/Los_Angeles", noonUtc)).toBe(5);
  });

  it("treats a missing or unusable zone as unknown, not as a failure", () => {
    expect(localHour(null, noonUtc)).toBeNull();
    expect(localHour("Mars/Olympus", noonUtc)).toBeNull();
  });

  it("knows business hours, and says nothing when the hour is unknown", () => {
    expect(isBusinessHours(9)).toBe(true);
    expect(isBusinessHours(22)).toBe(false);
    expect(isBusinessHours(null)).toBeNull();
  });
});

/**
 * "A routing decision the user cannot audit is worse than no routing." Every
 * decision has to be reproducible and carry the reasons that produced it.
 */
describe("the decision is auditable", () => {
  it("shows every candidate it considered, with scores", () => {
    const d = chooseMailbox([
      mailbox({ id: "a", email: "a@acme.com", reputationScore: 95 }),
      mailbox({ id: "b", email: "b@acme.com", reputationScore: 55 }),
    ]);
    expect(d.considered).toHaveLength(2);
    expect(d.considered[0].score).toBeGreaterThan(d.considered[1].score);
  });

  it("produces the same answer every time", () => {
    const pool = [mailbox({ id: "a" }), mailbox({ id: "b", email: "b@acme.com" })];
    const first = chooseMailbox(pool);
    for (let i = 0; i < 5; i++) expect(chooseMailbox(pool).mailboxId).toBe(first.mailboxId);
  });

  it("explains the choice in one sentence naming the reasons", () => {
    const d = chooseMailbox([
      mailbox({ id: "a", email: "strong@acme.com", reputationScore: 95 }),
      mailbox({ id: "b", email: "weak@acme.com", reputationScore: 40 }),
    ]);
    expect(d.email).toBe("strong@acme.com");
    expect(d.explanation).toContain("strong@acme.com");
    expect(d.explanation).toMatch(/strongest reputation/);
  });
});

describe("what decides the mailbox", () => {
  it("prefers the healthier mailbox", () => {
    const d = chooseMailbox([
      mailbox({ id: "low", email: "low@acme.com", reputationScore: 45 }),
      mailbox({ id: "high", email: "high@acme.com", reputationScore: 92 }),
    ]);
    expect(d.mailboxId).toBe("high");
  });

  it("treats a mailbox with no score as average, not as bad", () => {
    // A new mailbox has done nothing wrong; scoring it as zero would freeze it out.
    const d = chooseMailbox([
      mailbox({ id: "new", email: "new@acme.com", reputationScore: null }),
      mailbox({ id: "poor", email: "poor@acme.com", reputationScore: 50 }),
    ]);
    expect(d.mailboxId).toBe("new");
    expect(d.considered[0].notes.join(" ")).toMatch(/treated as average/);
  });

  it("prefers the same provider as the recipient", () => {
    const d = chooseMailbox(
      [
        mailbox({ id: "g", email: "g@acme.com", provider: "google", reputationScore: 80 }),
        mailbox({ id: "m", email: "m@acme.com", provider: "microsoft", reputationScore: 80 }),
      ],
      { recipientProvider: "microsoft" },
    );
    expect(d.mailboxId).toBe("m");
    expect(d.explanation).toMatch(/same provider/);
  });

  it("keeps cold volume off a mailbox that is still warming", () => {
    const d = chooseMailbox([
      mailbox({ id: "warming", email: "w@acme.com", warmupEnabled: true, reputationScore: 85 }),
      mailbox({ id: "ready", email: "r@acme.com", warmupEnabled: false, reputationScore: 78 }),
    ]);
    expect(d.mailboxId).toBe("ready");
  });

  it("spreads load toward the mailbox with more room left", () => {
    const d = chooseMailbox([
      mailbox({ id: "busy", email: "busy@acme.com", sentToday: 45, dailyLimit: 50 }),
      mailbox({ id: "fresh", email: "fresh@acme.com", sentToday: 2, dailyLimit: 50 }),
    ]);
    expect(d.mailboxId).toBe("fresh");
  });
});

describe("when nothing can send", () => {
  it("says so rather than returning a mailbox that cannot send", () => {
    expect(chooseMailbox([]).mailboxId).toBeNull();
    expect(chooseMailbox([]).explanation).toMatch(/No mailboxes are connected/);
  });

  it("distinguishes paused from used up", () => {
    expect(chooseMailbox([mailbox({ status: "paused" })]).explanation).toMatch(/paused or disconnected/);
    expect(chooseMailbox([mailbox({ sentToday: 50, dailyLimit: 50 })]).explanation)
      .toMatch(/full allowance for today/);
  });

  it("never picks a mailbox that is at its limit", () => {
    const d = chooseMailbox([
      mailbox({ id: "full", email: "full@acme.com", sentToday: 50, dailyLimit: 50, reputationScore: 99 }),
      mailbox({ id: "ok", email: "ok@acme.com", sentToday: 0, dailyLimit: 50, reputationScore: 60 }),
    ]);
    expect(d.mailboxId).toBe("ok");
  });
});

describe("timing is reported, not acted on", () => {
  const pool = [mailbox()];
  const evening = new Date("2026-09-02T22:00:00Z");

  it("flags an out-of-hours send without changing the mailbox", () => {
    const inHours = chooseMailbox(pool, { recipientTimezone: "UTC", now: new Date("2026-09-02T10:00:00Z") });
    const outOfHours = chooseMailbox(pool, { recipientTimezone: "UTC", now: evening });
    expect(outOfHours.mailboxId).toBe(inHours.mailboxId);
    expect(outOfHours.explanation).toMatch(/outside business hours/);
    expect(inHours.explanation).toMatch(/inside business hours/);
  });

  it("says nothing about timing when the zone is unknown", () => {
    expect(chooseMailbox(pool, { now: evening }).explanation).not.toMatch(/business hours/);
  });
});
