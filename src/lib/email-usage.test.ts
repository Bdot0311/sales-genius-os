import { describe, it, expect } from "vitest";
import {
  getCurrentMonthStartUTC,
  getNextMonthStartUTC,
  needsMonthlyReset,
  daysUntilReset,
  formatMonthlyLimit,
} from "./email-usage";

describe("monthly email cap reset (timezone-safe)", () => {
  it("anchors current month start to 1st of month at 00:00 UTC", () => {
    const start = getCurrentMonthStartUTC(new Date("2026-03-17T22:13:11.000Z"));
    expect(start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("rolls into next month even when user's local time is still 'previous' month", () => {
    // Simulate Hawaii (UTC-10): local clock shows Feb 28 23:00 but UTC is March 1 09:00.
    const now = new Date("2026-03-01T09:00:00.000Z");
    expect(getCurrentMonthStartUTC(now).toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(getNextMonthStartUTC(now).toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("handles December → January year rollover", () => {
    const now = new Date("2026-12-31T23:59:59.000Z");
    expect(getNextMonthStartUTC(now).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("needsMonthlyReset is true when last reset was prior month", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");
    expect(needsMonthlyReset("2026-05-01T00:00:00.000Z", now)).toBe(true);
    expect(needsMonthlyReset("2026-06-01T00:00:00.000Z", now)).toBe(false);
    expect(needsMonthlyReset(null, now)).toBe(true);
  });

  it("does NOT reset when last reset is mid-month and current is same month", () => {
    const now = new Date("2026-06-30T23:59:00.000Z");
    expect(needsMonthlyReset("2026-06-01T00:00:00.000Z", now)).toBe(false);
  });

  it("daysUntilReset never returns 0", () => {
    const now = new Date("2026-06-30T23:59:00.000Z");
    expect(daysUntilReset(now)).toBeGreaterThanOrEqual(1);
  });

  it("formatMonthlyLimit returns Unlimited for -1", () => {
    expect(formatMonthlyLimit(-1)).toBe("Unlimited");
    expect(formatMonthlyLimit(250000)).toBe("250,000");
  });
});
