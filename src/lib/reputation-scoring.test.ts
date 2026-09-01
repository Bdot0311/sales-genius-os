import { describe, expect, it } from "vitest";
import { computeReputation, MIN_VOLUME_FOR_SCORE } from "../../supabase/functions/_shared/reputation.ts";

const clean = { sent: 500, bounced: 0, complaints: 0, opened: 250 };

/**
 * Open tracking needs a pixel, the pixel raises spam score, and spam-foldered
 * mail still fires it when the provider loads images. Scoring a mailbox on that
 * number punished recipients who block images, and after the open-tracking
 * filters tightened it would have marked healthy mailboxes down for a change in
 * measurement rather than a change in deliverability.
 */
describe("open rate is reported, never scored", () => {
  it("scores a mailbox with no recorded opens the same as one with many", () => {
    const noOpens = computeReputation({ ...clean, opened: 0 });
    const manyOpens = computeReputation({ ...clean, opened: 400 });
    expect(noOpens.score).toBe(manyOpens.score);
    expect(noOpens.score).toBe(100);
  });

  it("still reports the rate", () => {
    expect(computeReputation({ ...clean, opened: 125 }).openRate).toBeCloseTo(0.25);
    expect(computeReputation({ ...clean, opened: 0 }).openRate).toBe(0);
  });
});

describe("what does move the score", () => {
  it("bounces", () => {
    const r = computeReputation({ ...clean, bounced: 25 }); // 5%
    expect(r.score).toBeLessThan(80);
    expect(r.bounceRate).toBeCloseTo(0.05);
  });

  it("complaints, harder per unit than bounces", () => {
    const bounced = computeReputation({ ...clean, bounced: 5 });   // 1%
    const complained = computeReputation({ ...clean, complaints: 5 }); // 1%
    expect(complained.score!).toBeLessThan(bounced.score!);
  });

  it("warmup mail landing in spam", () => {
    const r = computeReputation({ ...clean, warmupSent: 100, warmupInbox: 50, warmupSpam: 50 });
    expect(r.score).toBeLessThan(100);
  });

  it("never goes below zero or above 100", () => {
    const awful = computeReputation({ sent: 500, bounced: 400, complaints: 100, opened: 0 });
    expect(awful.score).toBeGreaterThanOrEqual(0);
    expect(computeReputation(clean).score).toBeLessThanOrEqual(100);
  });
});

describe("not enough data is not a bad score", () => {
  it("returns null below the volume floor", () => {
    const r = computeReputation({ sent: MIN_VOLUME_FOR_SCORE - 1, bounced: 0, complaints: 0, opened: 0 });
    expect(r.score).toBeNull();
  });

  it("counts warmup volume toward the floor — it is real sending", () => {
    const r = computeReputation({ sent: 5, bounced: 0, complaints: 0, opened: 0, warmupSent: 30 });
    expect(r.score).not.toBeNull();
  });
});
