import { describe, expect, it } from "vitest";
import {
  auditEmail,
  auditSummary,
  bodyWithoutSignature,
  findAsks,
  wordCount,
  worstSeverity,
} from "../../supabase/functions/_shared/email-audit.ts";

const rules = (f: { rule: string }[]) => f.map((x) => x.rule);

/**
 * The checks all existed and none of them could be run.
 *
 * BANNED_PHRASES, findUnverifiedClaims, findPlaceholders, findSenderStandIns
 * and findMirrorAnalogies only ever fired inside generate-email, on copy the
 * model had just written. An email you wrote yourself, or one a client sent
 * over, went through nothing.
 */

describe("the audit runs the checks the product already owned", () => {
  it("catches an unfilled merge field", () => {
    const f = auditEmail({ body: "Hi [FIRST_NAME], noticed [SIGNAL] and thought of you. Worth 15 minutes?" });
    expect(rules(f)).toContain("unfilled_placeholder");
    expect(f.find((x) => x.rule === "unfilled_placeholder")?.severity).toBe("blocker");
  });

  it("catches a result with no number behind it", () => {
    const f = auditEmail({ body: "Our clients typically see significant audience growth. Worth a look?" });
    expect(rules(f)).toContain("unverified_claim");
  });

  it("lets a figure through when the sender can back it", () => {
    const f = auditEmail({
      body: "Northfield cut ramp from five months to three. Want the one-page breakdown?",
      verifiedProof: "Northfield cut ramp from five months to three",
    });
    expect(rules(f)).not.toContain("unverified_claim");
  });

  it("catches the openers every automated email uses", () => {
    const f = auditEmail({ body: "I came across your company and wanted to reach out. Worth a chat?" });
    expect(rules(f)).toContain("banned_phrase");
  });
});

describe("length, because a stranger will not scroll", () => {
  it("ignores the signature when counting", () => {
    const body = "Noticed you are hiring four SDRs, which usually means ramp eats the quarter.\n\nWorth fifteen minutes?\n\nAlex\nFounder, Peak";
    expect(bodyWithoutSignature(body)).not.toContain("Founder, Peak");
    expect(wordCount(bodyWithoutSignature(body))).toBeLessThan(wordCount(body));
  });

  it("warns past a hundred words and blocks past the hard ceiling", () => {
    // 9 words a repeat: 18 of them clears the 140-word hard ceiling.
    const long = `Noticed you are hiring. ${"Ramp time eats the quarter for teams like this. ".repeat(18)}Worth fifteen minutes?`;
    expect(rules(auditEmail({ body: long }))).toContain("too_long");
    // 112 words: past the 100-word target, inside the 140 hard ceiling.
    const mid = `Noticed you are hiring, which usually means ramp eats the quarter. ${"Managers coach four new starters at once. ".repeat(14)}Worth fifteen minutes?`;
    const r = rules(auditEmail({ body: mid }));
    expect(r).toContain("over_length");
    expect(r).not.toContain("too_long");
  });

  it("notes a very short email, because the bridge is usually what is missing", () => {
    expect(rules(auditEmail({ body: "Hi Sarah, worth fifteen minutes?" }))).toContain("under_length");
  });
});

describe("one ask, because two asks is zero asks", () => {
  it("finds a question ask", () => {
    expect(findAsks("Worth fifteen minutes to compare notes?")).toHaveLength(1);
  });

  it("finds an ask with no question mark", () => {
    expect(findAsks("Let me know if that is useful.")).toHaveLength(1);
  });

  it("blocks two asks in one email", () => {
    const f = auditEmail({
      body: "Noticed the four SDR roles, which usually means ramp eats the quarter. Worth fifteen minutes? Or reply here and I will send the breakdown.",
    });
    expect(rules(f)).toContain("two_asks");
    expect(f.find((x) => x.rule === "two_asks")?.severity).toBe("blocker");
  });

  /*
   * "Err toward counting" was wrong in a way that refused real sends.
   *
   * Opening on a question about the reader's own situation is a recommended
   * technique in every outbound playbook — "How are you ramping the four SDRs
   * you just hired?" — and an email that opened on one and closed on "Worth a
   * quick look?" was scored as two asks. two_asks is a blocker, so the send
   * gate refused a correctly written email.
   *
   * Two asks is zero asks because the reader has to choose, and that only
   * happens when both ask for something.
   */
  it("does not count a diagnostic opener as a second ask", () => {
    const body =
      "Hi Dana,\n\nHow are you ramping the four SDRs you just hired? At that size the ramp lands on whoever closed last quarter.\n\nWorth a quick look?\n\nBest,\nBrandon";
    expect(findAsks(body)).toHaveLength(1);
    expect(rules(auditEmail({ body, position: 1 }))).not.toContain("two_asks");
  });

  it("still counts an earlier question that asks for a slot", () => {
    // This one competes with the closing ask rather than setting it up.
    const body =
      "Hi Dana,\n\nCan we hop on a 15-minute call Thursday? Four roles went up this month.\n\nWorth a look?\n\nBest,\nBrandon";
    expect(findAsks(body)).toHaveLength(2);
    expect(rules(auditEmail({ body, position: 1 }))).toContain("two_asks");
  });

  it("counts two asks that share the closing line", () => {
    const body = "Hi Dana,\n\nFour roles went up.\n\nWorth a 15-minute call? Or should I send the one-pager?\n\nBest,\nBrandon";
    expect(findAsks(body)).toHaveLength(2);
  });

  it("warns when there is no ask at all", () => {
    const f = auditEmail({ body: "Noticed the four SDR roles you posted, which usually means ramp time eats into the quarter for the whole team." });
    expect(rules(f)).toContain("no_ask");
  });
});

describe("the bridge from the signal to the problem", () => {
  it("flags a trigger named and then dropped", () => {
    // Mentioning the trigger and stopping is flattery, not relevance.
    const f = auditEmail({ body: "Noticed you just raised a Series A. Congrats on the round, it is well deserved. Worth fifteen minutes to talk?" });
    expect(rules(f)).toContain("signal_without_mechanism");
  });

  it("passes when the mechanism is actually stated", () => {
    const f = auditEmail({
      body: "Noticed four open SDR roles this month. Teams doing that usually hit ramp time eating the quarter, mostly because managers end up coaching four new starters at once. Worth fifteen minutes?",
    });
    expect(rules(f)).not.toContain("signal_without_mechanism");
  });
});

describe("rules that only apply at a position", () => {
  it("flags asking a stranger for thirty minutes on the first touch", () => {
    const f = auditEmail({
      position: 1,
      body: "Noticed the four SDR roles, which usually means ramp eats the quarter. Would you be open to a quick 30 minute call next week?",
    });
    expect(rules(f)).toContain("first_touch_big_ask");
  });

  it("does not flag fifteen minutes", () => {
    const f = auditEmail({
      position: 1,
      body: "Noticed the four SDR roles, which usually means ramp eats the quarter. Worth fifteen minutes to compare notes?",
    });
    expect(rules(f)).not.toContain("first_touch_big_ask");
  });

  it("blocks an ask in the pure-value touch", () => {
    // It works precisely because it asks for nothing; cutting that is the
    // commonest edit and the costliest.
    const f = auditEmail({
      position: 4,
      body: "Came across this and it is the clearest thing I have read on ramp time. The useful part is a third of the way in. Worth a look?",
    });
    expect(rules(f)).toContain("value_touch_has_ask");
  });

  it("does not demand an ask in the pure-value touch", () => {
    const f = auditEmail({
      position: 4,
      body: "Came across this and it is the clearest thing I have read on ramp time eating a quarter. The useful part is about a third of the way in. No reply needed.",
    });
    expect(rules(f)).not.toContain("no_ask");
  });

  it("blocks manufactured urgency in the breakup", () => {
    const f = auditEmail({
      position: 6,
      body: "Assuming this is not a priority. Last chance to grab a slot before the offer expires today. Reply if it changes.",
    });
    expect(rules(f)).toContain("manufactured_urgency");
  });

  it("passes a clean breakup", () => {
    const f = auditEmail({
      position: 6,
      body: "Assuming this is not a priority right now, which is a fair call. I will stop here rather than keep turning up in your inbox. If ramp time moves up the list, reply to this thread and I will pick it back up.",
    });
    expect(rules(f)).not.toContain("manufactured_urgency");
  });
});

describe("the summary the agent has to repeat", () => {
  it("says plainly when nothing is wrong", () => {
    expect(auditSummary([])).toMatch(/no rule violations/i);
    expect(worstSeverity([])).toBeNull();
  });

  it("forbids sending when there is a blocker", () => {
    const f = auditEmail({ body: "Hi [FIRST_NAME], worth a look?" });
    expect(worstSeverity(f)).toBe("blocker");
    expect(auditSummary(f)).toMatch(/do NOT send/i);
  });
});

describe("the anchor from the sequence guide passes its own audit", () => {
  it("is clean", () => {
    const f = auditEmail({
      position: 1,
      subject: "four open SDR roles",
      body: [
        "Sarah,",
        "",
        "Noticed four open SDR roles posted this month.",
        "Teams doing that usually hit ramp time eating the quarter, mostly because managers end up coaching four new starters at once.",
        "We got a fifty-person SaaS team past it without adding another manager.",
        "",
        "Worth fifteen minutes to compare notes?",
      ].join("\n"),
    });
    expect(f.filter((x) => x.severity === "blocker")).toEqual([]);
  });
});
