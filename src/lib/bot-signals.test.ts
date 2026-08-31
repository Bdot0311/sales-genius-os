import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  HONEYPOT_FIELD,
  MIN_FILL_SECONDS,
  botRejectionMessage,
  botSignals,
  isMeaningfulAnswer,
} from "../../supabase/functions/_shared/bot-signals";

const REAL_FILL_MS = 45_000;

describe("the honeypot", () => {
  it("catches a script that filled every field it found", () => {
    expect(botSignals({ honeypot: "555-0100", elapsedMs: REAL_FILL_MS })).toContain("honeypot_filled");
  });

  it("leaves a person alone", () => {
    expect(botSignals({ honeypot: "", elapsedMs: REAL_FILL_MS })).toEqual([]);
    expect(botSignals({ honeypot: undefined, elapsedMs: REAL_FILL_MS })).toEqual([]);
  });
});

describe("fill timing", () => {
  it("catches an instant submit", () => {
    expect(botSignals({ elapsedMs: 200 })).toContain("submitted_too_fast");
    expect(botSignals({ elapsedMs: MIN_FILL_SECONDS * 1000 - 1 })).toContain("submitted_too_fast");
  });

  it("accepts someone who actually read the form", () => {
    expect(botSignals({ elapsedMs: MIN_FILL_SECONDS * 1000 })).toEqual([]);
    expect(botSignals({ elapsedMs: REAL_FILL_MS })).toEqual([]);
  });

  it("asks for a reload on a tab left open all day", () => {
    expect(botSignals({ elapsedMs: 24 * 3600 * 1000 })).toContain("form_expired");
  });

  it("does not guess when the timing is missing or nonsense", () => {
    expect(botSignals({})).toEqual([]);
    expect(botSignals({ elapsedMs: "soon" })).toEqual([]);
    expect(botSignals({ elapsedMs: -5 })).toEqual([]);
  });
});

describe("answers that carry no information", () => {
  it("rejects filler", () => {
    for (const junk of ["aaaaaa", "....", "test", "asdfasdf", "n/a", "none", "xxxx", "qwerty", "https://spam.example.com"]) {
      expect(isMeaningfulAnswer(junk), junk).toBe(false);
    }
  });

  it("accepts terse but real answers", () => {
    for (const real of [
      "agencies",
      "more demos",
      "Heads of RevOps at 20-200 person B2B SaaS",
      "Book 5 discovery calls this month",
      "SaaS",
    ]) {
      expect(isMeaningfulAnswer(real), real).toBe(true);
    }
  });

  it("only flags a submission when every answer is junk", () => {
    expect(botSignals({ answers: ["asdfasdf", "aaaa"], elapsedMs: REAL_FILL_MS })).toContain("answer_not_meaningful");
    // One real answer is enough — a thin second answer is a person being brief.
    expect(botSignals({ answers: ["agencies in the UK", "asdf"], elapsedMs: REAL_FILL_MS })).toEqual([]);
  });
});

describe("what the rejection says", () => {
  it("never names the trap it tripped", () => {
    const message = botRejectionMessage(["honeypot_filled"]);
    expect(message).not.toMatch(/honeypot|bot|automat|trap/i);
    expect(message).not.toContain(HONEYPOT_FIELD);
  });

  it("tells someone with a stale tab what to actually do", () => {
    expect(botRejectionMessage(["form_expired"])).toMatch(/reload/i);
  });
});

/**
 * The alert that started this: "Unknown visitor / not signed in / Anonymous
 * visitor booking", sent because a landing-page CTA click emailed sales.
 */
describe("only a real submission alerts sales", () => {
  const clickLogger = readFileSync("supabase/functions/log-campaign-setup-request/index.ts", "utf8");
  const formSubmit = readFileSync("supabase/functions/submit-campaign-setup/index.ts", "utf8");

  it("the click logger sends no email at all", () => {
    expect(clickLogger).not.toMatch(/sendAppEmail|send-transactional-email/);
    expect(clickLogger).not.toMatch(/campaign-setup-request['"]/);
  });

  it("the click logger still records the click for attribution", () => {
    expect(clickLogger).toMatch(/from\("campaign_setup_requests"\)\s*\.insert/);
  });

  it("the form endpoint refuses an anonymous post", () => {
    expect(formSubmit).toMatch(/401/);
    expect(formSubmit).toMatch(/Please sign in to request a campaign setup/);
  });

  it("the form endpoint takes the address from the session, not the body", () => {
    expect(formSubmit).toMatch(/const email = clean\(user\.email/);
    // A body-supplied email would let anyone put any address in the alert.
    expect(formSubmit).not.toMatch(/clean\(raw\.email/);
  });

  it("the form endpoint runs the automation checks server-side", () => {
    expect(formSubmit).toMatch(/botSignals\(/);
  });
});
