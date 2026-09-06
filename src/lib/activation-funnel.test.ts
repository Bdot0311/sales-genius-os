import { describe, it, expect } from "vitest";
import {
  funnelRows, isMonotonic, biggestDropStep, percentOf, freshnessLabel,
  ACTIVATION_FUNNEL_STEPS, type ActivationFunnelResponse,
} from "./activation-funnel";

const base = (funnel: Record<string, number>, extra: Partial<ActivationFunnelResponse> = {}): ActivationFunnelResponse => ({
  range_days: 30,
  funnel,
  cohorts: { tire_kicker: 0, explorer: 0, active: 0, power: 0 },
  ...extra,
});

describe("the shape that was reported broken", () => {
  // The screenshot: Onboarded 3 sat between First search 5 and Verified 12,
  // so the funnel went down then up. The old UI only rendered a drop when
  // `dropoff > 0`, so the increase was invisible.
  it("surfaces a step that gains users instead of hiding it", () => {
    const rows = funnelRows(base({
      signed_up: 12, verified_email: 12, first_search: 3,
      first_lead_saved: 5, mailbox_connected: 2, first_email_sent: 0,
    }));
    const gained = rows.find((r) => r.key === "first_lead_saved")!;
    expect(gained.changePct).toBe(67);      // +67%, not swallowed
    expect(isMonotonic(rows)).toBe(false);  // and flagged as impossible
  });

  it("accepts a genuine cumulative funnel", () => {
    const rows = funnelRows(base({
      signed_up: 11, verified_email: 11, first_search: 4,
      first_lead_saved: 3, mailbox_connected: 2, first_email_sent: 2,
    }));
    expect(isMonotonic(rows)).toBe(true);
    expect(rows.every((r) => r.changePct === null || r.changePct <= 0)).toBe(true);
  });
});

describe("cumulative vs ever", () => {
  it("shows the independent count when a user skipped the step", () => {
    // Matches the Postgres run: 2 reached mailbox-or-beyond, 1 truly connected.
    const rows = funnelRows(base(
      { signed_up: 11, verified_email: 11, first_search: 4, first_lead_saved: 3, mailbox_connected: 2, first_email_sent: 2 },
      { ever: { verified_email: 11, first_search: 4, first_lead_saved: 3, mailbox_connected: 1, first_email_sent: 2 } },
    ));
    expect(rows.find((r) => r.key === "mailbox_connected")!.everValue).toBe(1);
  });

  it("stays quiet when the two agree", () => {
    const rows = funnelRows(base(
      { signed_up: 4, verified_email: 4, first_search: 2, first_lead_saved: 1, mailbox_connected: 1, first_email_sent: 1 },
      { ever: { verified_email: 4, first_search: 2, first_lead_saved: 1, mailbox_connected: 1, first_email_sent: 1 } },
    ));
    expect(rows.every((r) => r.everValue === null)).toBe(true);
  });
});

describe("onboarding is not a funnel step", () => {
  it("is absent from the chain, because users search without completing it", () => {
    expect(ACTIVATION_FUNNEL_STEPS.map((s) => s.key)).not.toContain("completed_onboarding");
  });
});

describe("edge cases that produced NaN or a silent zero before", () => {
  it("handles zero signups without dividing by zero", () => {
    const rows = funnelRows(base({ signed_up: 0, verified_email: 0, first_search: 0, first_lead_saved: 0, mailbox_connected: 0, first_email_sent: 0 }));
    expect(rows.every((r) => r.pct === 0 && Number.isFinite(r.pct))).toBe(true);
    expect(rows.every((r) => r.changePct === null)).toBe(true);
  });

  it("returns nothing for a null response rather than a row of zeros", () => {
    expect(funnelRows(null)).toEqual([]);
  });

  it("gives the first step no change figure", () => {
    const rows = funnelRows(base({ signed_up: 5, verified_email: 5, first_search: 1, first_lead_saved: 0, mailbox_connected: 0, first_email_sent: 0 }));
    expect(rows[0].changePct).toBeNull();
  });

  it("percentOf is exact to one decimal", () => {
    expect(percentOf(5, 12)).toBe(41.7);
    expect(percentOf(3, 12)).toBe(25);
    expect(percentOf(1, 0)).toBe(0);
  });
});

describe("biggestDropStep", () => {
  it("names the step losing the most, ignoring flat ones", () => {
    const rows = funnelRows(base({
      signed_up: 100, verified_email: 100, first_search: 40,
      first_lead_saved: 38, mailbox_connected: 5, first_email_sent: 5,
    }));
    expect(biggestDropStep(rows)!.key).toBe("mailbox_connected"); // -87%
  });

  it("returns null when nothing drops", () => {
    const rows = funnelRows(base({ signed_up: 3, verified_email: 3, first_search: 3, first_lead_saved: 3, mailbox_connected: 3, first_email_sent: 3 }));
    expect(biggestDropStep(rows)).toBeNull();
  });
});

describe("freshness", () => {
  const now = new Date("2026-09-06T12:00:00Z").getTime();
  it("reads recent data as just now", () => {
    expect(freshnessLabel("2026-09-06T11:59:30Z", now)).toBe("just now");
  });
  it("reports minutes and hours", () => {
    expect(freshnessLabel("2026-09-06T11:30:00Z", now)).toBe("30m ago");
    expect(freshnessLabel("2026-09-06T09:00:00Z", now)).toBe("3h ago");
  });
  it("says nothing when the RPC omits the timestamp", () => {
    expect(freshnessLabel(undefined, now)).toBe("");
    expect(freshnessLabel("not a date", now)).toBe("");
  });
});
