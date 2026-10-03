import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fallbackSubject } from "../../supabase/functions/_shared/draft-one";
import {
  DUPLICATE_WINDOW_DAYS,
  duplicateGuidanceFor,
  duplicateRefusal,
  duplicateWindowStart,
  normalizeRecipient,
} from "../../supabase/functions/_shared/duplicate-send.ts";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const DRAFT_ONE = readFileSync("supabase/functions/_shared/draft-one.ts", "utf8");
const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");

/**
 * The loop the user was stuck in, written down.
 *
 * 1. Ask the agent to send. Some sends come back refused as duplicates.
 * 2. The agent reads "duplicate" as a problem with the drafts and offers to
 *    delete and redraft them.
 * 3. The user says yes. The redraft instruction is dropped on the floor,
 *    because generate-email only read customInstruction on goal 'custom'.
 * 4. The regenerated email lands on the same deterministic subject.
 * 5. The send is refused again. Go to 2.
 *
 * Each step below is one of those five links.
 */

describe("the refusal names a remedy that can actually work", () => {
  const refusal = duplicateRefusal({
    to: " Sam@Acme.IO ",
    subject: "quick q about acme's outbound",
    previouslySentAt: "2026-08-30T11:04:00.000Z",
  });

  it("says the draft is not the problem", () => {
    expect(refusal.error).toMatch(/not the problem/i);
  });

  it("rules out redrafting explicitly, because that is what kept being tried", () => {
    expect(refusal.redraft_will_not_help).toBe(true);
  });

  it("offers a new angle and a deliberate resend, and nothing else", () => {
    expect(refusal.remedy).toHaveLength(2);
    expect(refusal.remedy[0]).toMatch(/different subject/i);
    expect(refusal.remedy[1]).toMatch(/resend/i);
  });

  it("names the date the recipient actually got it", () => {
    expect(refusal.error).toContain("2026-08-30");
  });

  it("reports the recipient in one spelling", () => {
    expect(refusal.error).toContain("sam@acme.io");
  });
});

describe("one spelling of an address on both sides of the guard", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeRecipient("  Sam@Acme.IO ")).toBe("sam@acme.io");
  });

  it("stores what it searches for", () => {
    // The lookup lowercased; the insert did not. A row written as "Sam@Acme.io"
    // was invisible to a guard looking for "sam@acme.io", so the protection
    // silently applied to some recipients and not others.
    expect(SEND).toContain("to_email: normalizeRecipient(to)");
    expect(SEND).toContain("eq('to_email', normalizeRecipient(to))");
  });

  it("looks back a bounded window", () => {
    const start = Date.parse(duplicateWindowStart(new Date("2026-09-04T00:00:00Z")));
    expect(new Date(start).toISOString()).toBe("2026-08-21T00:00:00.000Z");
    expect(DUPLICATE_WINDOW_DAYS).toBe(14);
  });
});

describe("the agent is told which remedy is wrong", () => {
  const guidance = duplicateGuidanceFor(3, ["quick q", "re: outbound"]);

  it("forbids the delete-and-redraft offer in the tool result itself", () => {
    expect(guidance).toMatch(/do not offer to delete and redraft/i);
  });

  it("explains why it cannot work, rather than only forbidding it", () => {
    expect(guidance).toMatch(/block is on what was already sent/i);
  });

  it("reaches the model through the send_drafts note", () => {
    const branch = AGENT.slice(
      AGENT.indexOf('case "send_drafts": {'),
      AGENT.indexOf('case "schedule_drafts": {'),
    );
    expect(branch).toContain("duplicateGuidanceFor");
    expect(branch).toContain("duplicateNote");
  });

  it("reaches the user in code, not only through the model's summary", () => {
    expect(AGENT).toContain("duplicateRefusals.length > 0");
    expect(AGENT).toMatch(/deleting and redrafting them will not change this/i);
  });

  it("is a standing rule, not only a per-turn note", () => {
    expect(AGENT).toContain("- REPEATS:");
  });
});

describe("a redraft instruction survives the goal it was sent with", () => {
  it("is applied on every goal, not only 'custom'", () => {
    // draft_outreach sends goal 'introduction' with the user's feedback as
    // customInstruction. Read in one branch only, it was silently discarded,
    // and "yes, write them again differently" produced the same email.
    expect(GEN).toContain("if (!isPrecisionEdit && customInstruction)");
    expect(GEN).toContain("REDRAFT DIRECTIVE");
  });

  it("demands a structural change rather than a reword", () => {
    const block = GEN.slice(GEN.indexOf("REDRAFT DIRECTIVE"), GEN.indexOf("REDRAFT DIRECTIVE") + 900);
    expect(block).toMatch(/different subject line/i);
    expect(block).toMatch(/synonyms swapped in/i);
  });

  it("lands after the research so it is the most recent instruction", () => {
    const research = GEN.indexOf("${researchBlock}${NO_HALLUCINATION_RULE}");
    const directive = GEN.indexOf("REDRAFT DIRECTIVE");
    expect(research).toBeGreaterThan(-1);
    expect(directive).toBeGreaterThan(research);
  });
});

describe("a redraft cannot land on a subject the recipient already has", () => {
  it("generate-email is told which subjects are already spent", () => {
    expect(GEN).toContain("avoidSubjects");
    expect(GEN).toMatch(/SUBJECT LINES ALREADY SENT/);
  });

  it("the agent looks them up and passes them", () => {
    // The lookup moved into _shared/draft-one.ts when the queue worker needed
    // the same draft path. Pinned to both halves of the guarantee: somebody
    // reads the sent history, and the result reaches the generator.
    expect(DRAFT_ONE).toContain('.from("sent_emails")');
    expect(DRAFT_ONE).toContain("avoidSubjects");
    // And the inline path still asks for them rather than passing an empty list.
    const branch = AGENT.slice(
      AGENT.indexOf('case "draft_outreach"'),
      AGENT.indexOf('case "draft_sequence"'),
    );
    expect(branch).toContain("sentSubjectsFor(admin, userId, ids)");
    expect(branch).toContain("sentSubjects.get(id) ?? []");
  });

  it("the deterministic fallback subject varies once it has been used", () => {
    // "Quick question — Acme" is the same string every time it is generated,
    // so a redraft reproduced a subject the guard had already refused.
    //
    // Now that it is a function rather than a block inside a closure, this runs
    // it instead of reading it: the second call must not return the first one.
    const first = fallbackSubject("Acme", []);
    const second = fallbackSubject("Acme", [first]);
    expect(first.toLowerCase()).toContain("acme");
    expect(second).not.toBe(first);
    expect(second.toLowerCase()).toContain("acme");
    // A third, with both spent, still moves.
    expect(fallbackSubject("Acme", [first, second])).not.toBe(second);
  });
});

describe("a deliberate resend is reachable", () => {
  it("both send tools expose it", () => {
    expect(AGENT.split("allow_duplicate: {").length - 1).toBe(2);
  });

  it("it is passed through to send-email rather than dropped", () => {
    expect(AGENT).toContain("allowDuplicate: args.allow_duplicate === true");
    expect(AGENT).toContain('opts.allowDuplicate === true ? { allowDuplicate: true } : {}');
  });

  it("is off unless asked for, so the guard still protects by default", () => {
    // Spreading `{allowDuplicate: false}` would be harmless, but spreading
    // nothing makes it impossible for a default to drift into always-on.
    expect(AGENT).not.toContain("allowDuplicate: true,\n        to,");
  });
});

/**
 * send_outreach never passed the user's confirmation to deliver(), so in
 * approval mode it returned "awaiting confirmation" forever: the user saying
 * "yes, send it" reached the tool and changed nothing.
 */
describe("send_outreach can actually send once the user agrees", () => {
  const branch = AGENT.slice(
    AGENT.indexOf('case "send_outreach": {'),
    AGENT.indexOf('case "list_sequences": {'),
  );

  it("passes the confirmation through", () => {
    expect(branch).toContain("confirmed: args.confirmed === true || confirmedByUser");
  });

  it("accepts the flag the model would set", () => {
    const schema = AGENT.slice(AGENT.indexOf('name: "send_outreach"'), AGENT.indexOf('name: "list_sequences"'));
    expect(schema).toContain("confirmed: {");
  });
});
