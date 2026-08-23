import { describe, expect, it } from "vitest";
import { findUnverifiedClaims } from "../../supabase/functions/_shared/email-rules.ts";

/**
 * A model told not to invent metrics can satisfy the letter of that rule by
 * dropping the figures. Every numeric pattern then misses, the fabrication
 * retry never fires, and the invented customer reaches a real prospect.
 */
describe("fabricated proof that carries no number", () => {
  it("catches the anonymized case study that shipped", () => {
    const body =
      "Our platform ensures every email hits the inbox and drives replies, like for one computer software firm that saw a significant increase in meetings booked.";
    expect(findUnverifiedClaims(body)).not.toHaveLength(0);
  });

  it("catches an anonymized customer paired with an outcome", () => {
    expect(findUnverifiedClaims("a client who doubled their pipeline last year")).not.toHaveLength(0);
    expect(findUnverifiedClaims("another agency reported faster ramp")).not.toHaveLength(0);
  });

  it("catches a magnitude word with no magnitude", () => {
    expect(findUnverifiedClaims("teams see a substantial lift in replies")).not.toHaveLength(0);
    expect(findUnverifiedClaims("a meaningful reduction in ramp time")).not.toHaveLength(0);
  });

  it("catches an invented result attributed to a PERSON", () => {
    // This shipped. The noun list held only company words, so the model
    // attributed the invented outcome to a founder instead of a business.
    expect(findUnverifiedClaims("One Co-Founder saw their reply rate increase after switching to us"))
      .not.toHaveLength(0);
    expect(findUnverifiedClaims("a CEO who doubled their pipeline")).not.toHaveLength(0);
  });

  it("catches a magnitude stated as a comparative", () => {
    // "a significant increase" was caught; "significantly more" was not, and
    // that phrasing shipped.
    expect(findUnverifiedClaims("see significantly more relevant replies")).not.toHaveLength(0);
    expect(findUnverifiedClaims("substantially fewer bounces")).not.toHaveLength(0);
  });

  it("catches an unattributed switching claim", () => {
    expect(findUnverifiedClaims("teams report better results after switching to us")).not.toHaveLength(0);
  });

  it("catches peer claims about companies like yours", () => {
    expect(findUnverifiedClaims("companies like yours book more meetings")).not.toHaveLength(0);
  });

  it("still catches the numeric claims it always did", () => {
    expect(findUnverifiedClaims("cut ramp time 40%")).not.toHaveLength(0);
    expect(findUnverifiedClaims("customers reply 3x more")).not.toHaveLength(0);
  });

  it("accepts a claim the sender actually supplied as proof", () => {
    const proof = "Acme cut ramp time 40% in Q2 2026";
    expect(findUnverifiedClaims("Acme cut ramp time 40% in Q2", proof)).toHaveLength(0);
  });
});

describe("ordinary copy is not flagged", () => {
  // A checker that fires on normal sentences pushes the model toward vaguer
  // writing, which is the failure this exists to prevent.
  const CLEAN = [
    "you opened three sales roles last week, so ramp is probably on your mind.",
    "worth a look?",
    "most teams your size run outbound off a spreadsheet and a lot of hope.",
    "I saw your team is hiring across the go-to-market side.",
    "happy to send the one-page teardown if it is useful.",
    "your careers page lists two SDR openings in London.",
  ];

  for (const line of CLEAN) {
    it(`leaves alone: "${line.slice(0, 42)}…"`, () => {
      expect(findUnverifiedClaims(line)).toHaveLength(0);
    });
  }
});
