import { describe, expect, it } from "vitest";
import { dunningStage, shouldAlertForFailure, DUNNING } from "../../supabase/functions/_shared/dunning-policy";

const t0 = new Date("2026-10-01T00:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * 3_600_000);

describe("failed payment policy", () => {
  it("keeps paid access for one day after the first failure", () => {
    expect(DUNNING.graceDays).toBe(1);
    expect(dunningStage(t0, 1, at(23))).toBe("grace");
  });

  it("drops to free temporarily after the first day", () => {
    expect(dunningStage(t0, 2, at(25))).toBe("temporary_free");
  });

  it("goes permanently free after three days", () => {
    expect(dunningStage(t0, 2, at(72))).toBe("final");
  });

  it("goes permanently free when the third retry fails", () => {
    expect(dunningStage(t0, 4, at(30))).toBe("final");
    expect(dunningStage(t0, 3, at(30))).toBe("temporary_free");
  });

  it("alerts only on the first and final failure", () => {
    expect(shouldAlertForFailure(1, "grace")).toBe(true);
    expect(shouldAlertForFailure(2, "temporary_free")).toBe(false);
    expect(shouldAlertForFailure(4, "final")).toBe(true);
  });
});
