import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  findClippedOpeners,
  findNameMismatches,
  findBannedPhrases,
  repairCompanyCasing,
  findTouchOnePitch,
} from "../../supabase/functions/_shared/email-rules.ts";
import { auditEmail } from "../../supabase/functions/_shared/email-audit.ts";

/**
 * A draft that reached a real prospect:
 *
 *   Noticed KOgenie is marking multi-platform launch as coming soon. [...]
 *   a system that scales outbound without adding headcount.
 *   Worth comparing notes on how you're handling that?
 *
 * Three separate failures, and the interesting part is that the checker was
 * not blind to all of them.
 */
const SHIPPED = `Hi Aryan,

Noticed KOgenie is marking multi-platform launch as coming soon. Teams building ad platforms usually hit the same wall around this point: pipeline predictability tanks the moment you shift focus from product to customer acquisition.

Most CTOs we work with end up doing both until they have a system that scales outbound without adding headcount.

Worth comparing notes on how you're handling that?`;

describe("what the list already caught, and shipped anyway", () => {
  it("two phrases were on the banned list the whole time", () => {
    // This is the finding that matters: detection was never the problem.
    // generate-email retries once, keeps whichever draft carries fewer, and
    // then dropped the survivors on the floor without telling anyone.
    expect(findBannedPhrases(SHIPPED).sort()).toEqual([
      "without adding headcount",
      "worth comparing",
    ]);
  });

  it("survivors are now returned rather than discarded", () => {
    const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
    expect(GEN).toContain("style_warnings: bannedHits");
    expect(GEN).toContain("name_warnings: findNameMismatches(email");
  });

  it("and reach the chat, where the drafts are", () => {
    const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
    expect(AGENT).toContain("Wrong name in draft");
    expect(AGENT).toContain("House-style filler survived");
  });
});

describe("openers with the pronoun dropped", () => {
  it("catches the clipped form the literal list missed", () => {
    // BANNED_PHRASES has "I noticed"; the draft opened "Noticed KOgenie is".
    expect(findBannedPhrases("Noticed KOgenie is shipping.")).toEqual([]);
    expect(findClippedOpeners(SHIPPED)[0]).toMatch(/^Noticed KOgenie is marking/);
  });

  it.each([
    ["Came across your changelog last week.", true],
    ["Saw that you shipped multi-region.", true],
    ["Hope this finds you well.", true],
    ["Quick question about your pricing.", true],
    ["Your pricing page says X. We noticed a spike in usage.", false],
    ["The team noticed it too, which is why they rebuilt it.", false],
  ])("%s -> fires: %s", (text, shouldFire) => {
    expect(findClippedOpeners(text).length > 0).toBe(shouldFire);
  });

  it("reads as a banned phrase in the audit, not a separate concept", () => {
    const f = auditEmail({ body: `Noticed you shipped a new pricing page. ${"word ".repeat(55)}Worth a reply?` });
    expect(f.map((x) => x.rule)).toContain("banned_phrase");
  });
});

describe("names checked against the lead record", () => {
  it("catches the capitalisation that shipped", () => {
    expect(findNameMismatches(SHIPPED, { company: "Kogenie", contactName: "Aryan Singh" }))
      .toEqual(['"KOgenie" should be "Kogenie"']);
  });

  it("catches a wrong first name in the greeting", () => {
    expect(findNameMismatches("Hi Priya, quick note.", { contactName: "Aryan Singh" }))
      .toEqual(['greets "Priya" but the lead is "Aryan Singh"']);
  });

  it.each([
    ["spelled correctly", "Kogenie ships fast.", { company: "Kogenie" }],
    ["company never mentioned", "Hi Aryan, your platform looks sharp.", { company: "Kogenie", contactName: "Aryan Singh" }],
    ["greeting matches", "Hi Aryan, quick note.", { contactName: "Aryan Singh" }],
    ["no lead context at all", "Hi Aryan, quick note.", {}],
  ])("stays quiet when %s", (_label, body, lead) => {
    expect(findNameMismatches(body, lead)).toEqual([]);
  });

  it("escapes regex metacharacters in a company name", () => {
    // "C++ (IO)" compiled as a pattern would throw or match nothing.
    expect(findNameMismatches("we love c++ (io) here", { company: "C++ (IO)" }))
      .toEqual(['"c++ (io)" should be "C++ (IO)"']);
  });

  it("is a blocker in the audit, since a reader cannot read past it", () => {
    const f = auditEmail({
      body: `Noticed KOgenie shipped. ${"word ".repeat(55)}Worth a reply?`,
      lead: { company: "Kogenie" },
    });
    const hit = f.find((x) => x.rule === "name_mismatch");
    expect(hit?.severity).toBe("blocker");
  });

  it("the audit tool reads the lead from the row, not from the model", () => {
    // If the model supplied the company name it would be checking the copy
    // against its own memory of it, which is the thing that was wrong.
    const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
    expect(AGENT).toMatch(/from\("leads"\)\s*\n\s*\.select\("company_name, contact_name"\)/);
    expect(AGENT).toContain("lead: auditLead");
  });
});

/**
 * Reporting a fault a machine can resolve from data it already holds is a
 * question that did not need asking. One batch produced "import2" for Import2,
 * "profile sketch" for Profile Sketch and "spekit" for Spekit — three drafts
 * each waiting on someone to retype a value sitting on the lead row.
 */
describe("capitalisation is repaired, not just reported", () => {
  it.each([
    ["Noticed import2 is hiring. import2 looks sharp.", "Import2", "Noticed Import2 is hiring. Import2 looks sharp."],
    ["profile sketch's recruitment playbook", "Profile Sketch", "Profile Sketch's recruitment playbook"],
    ["spekit's mcp integration", "Spekit", "Spekit's mcp integration"],
  ])("fixes %s", (body, company, expected) => {
    expect(repairCompanyCasing(body, company).text).toBe(expected);
  });

  it("clears the warning it would otherwise have raised", () => {
    const fixed = repairCompanyCasing("Noticed import2 is hiring.", "Import2");
    expect(findNameMismatches(fixed.text, { company: "Import2" })).toEqual([]);
  });

  it("says what it changed rather than editing silently", () => {
    expect(repairCompanyCasing("noticed import2 shipped", "Import2").repaired)
      .toEqual(['"import2" → "Import2"']);
  });

  it("rewrites capitalisation, never which name is there", () => {
    // A draft about the wrong company is the failure worth surfacing; quietly
    // substituting the right one would hide it.
    expect(repairCompanyCasing("Noticed Acme is hiring.", "Import2").text)
      .toBe("Noticed Acme is hiring.");
  });

  it.each([
    ["already correct", "Import2 ships fast.", "Import2"],
    ["mixed correct and wrong — a different problem", "Import2 and import2", "Import2"],
    ["inside a URL", "see import2.com for details", "Import2"],
    ["inside an email address", "mail a@import2.com today", "Import2"],
    ["company absent from the body", "Hi Aryan, nice work.", "Import2"],
    ["no company on the lead", "anything", ""],
  ])("leaves it alone: %s", (_label, body, company) => {
    expect(repairCompanyCasing(body, company).text).toBe(body);
    expect(repairCompanyCasing(body, company).repaired).toEqual([]);
  });

  it("escapes regex metacharacters in the company name", () => {
    expect(repairCompanyCasing("we use c++ (io) daily", "C++ (IO)").text)
      .toBe("we use C++ (IO) daily");
  });

  it("runs before the rubric scores the draft", () => {
    // Otherwise the score describes copy that is about to change.
    const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
    // Anchored on the first scoring call rather than its old declaration: the
    // score is now reassigned when a rewrite beats it, so `const` was wrong.
    const firstScore = GEN.indexOf("let rubric = await scoreNow(email);");
    expect(firstScore).toBeGreaterThan(-1);
    expect(GEN.indexOf("repairCompanyCasing(email")).toBeLessThan(firstScore);
  });

  it("reports repairs and surviving warnings separately", () => {
    const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
    expect(GEN).toContain("name_repairs: casing.repaired");
    const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
    expect(AGENT).toContain("Fixed name capitalisation");
    expect(AGENT).toContain("could not be corrected from the lead record");
  });
});

/**
 * PLAYBOOK_SYSTEM_RULES calls this non-negotiable: "Touch 1 earns a reply, it
 * does not sell... Do not explain the product, list features, or write 'we
 * built' / 'we help' / 'our platform' on touch 1."
 *
 * Nothing checked it. An email went out reading "Most founders we work with
 * solve it by automating the repetitive parts", the agent listed it under
 * "issues the audit doesn't catch", and it was right — a rule the product
 * declares in capitals depended on the model choosing to remember it.
 */
describe("the pitch the playbook forbids on touch 1", () => {
  const EMAIL = `Hi Aryan,
Noticed you're building toward multi-platform ad deployment on Kogenie. Teams at that stage usually hit the same wall.
Most founders we work with solve it by automating the repetitive parts so their early customers don't need to hire ops people.
Worth a quick look at how one similar founder handled this?
Brandon
Founder, BDOT Industries LLC`;

  it("is a finding on the email that shipped", () => {
    expect(auditEmail({ body: EMAIL }).map((f) => f.rule)).toContain("touch_one_pitch");
  });

  it("applies when no position is given, since a lone cold email is a first touch", () => {
    expect(auditEmail({ body: EMAIL, position: 1 }).some((f) => f.rule === "touch_one_pitch")).toBe(true);
    expect(auditEmail({ body: EMAIL }).some((f) => f.rule === "touch_one_pitch")).toBe(true);
  });

  it("applies on a later touch too, because the prompt it enforces is not gated", () => {
    // This used to pass at position 3, on the reading that a follow-up may
    // name the mechanism. The system prompt generate-email actually sends is
    // unconditional -- "the body NEVER names your own product or company" --
    // so a follow-up reading "We help companies like yours build the lead
    // sourcing and campaign infrastructure" was caught by nothing and scored
    // 83 out of 100.
    expect(auditEmail({ body: EMAIL, position: 3 }).some((f) => f.rule === "touch_one_pitch")).toBe(true);
  });

  it("excuses the one sentence the playbook itself fixes", () => {
    // The 4P's follow-up prompt orders this opener verbatim, and it contains
    // the construction the same prompt bans. Excusing the quoted sentence is
    // what lets the rule apply to every sentence after it.
    const locked = "I reached out the other day but likely didn't do the best job explaining how we help.";
    expect(findTouchOnePitch(locked)).toEqual([]);
    expect(
      findTouchOnePitch(`${locked}\n\nWe help companies like yours build the infrastructure.`).length,
    ).toBeGreaterThan(0);
  });

  it("ignores the signature, which the playbook allows to carry the company", () => {
    expect(findTouchOnePitch("Brandon\nFounder, BDOT Industries LLC")).toEqual([]);
  });

  it.each([
    ["we work with", "Most founders we work with solve it differently."],
    ["we help", "We help teams ship faster."],
    ["our platform", "Our platform handles the routing."],
  ])("fires on %s", (_l, t) => expect(findTouchOnePitch(t).length).toBeGreaterThan(0));

  it.each([
    ["a you-focused question", "What do you work with today?"],
    ["'we' with no pitch shape", "We should talk when it suits you."],
    ["their platform, not ours", "Your platform handles multi-region well."],
  ])("stays quiet on %s", (_l, t) => expect(findTouchOnePitch(t)).toEqual([]));
});

/**
 * The follow-up that read like a brochure.
 *
 * A 4ps_followup draft went to a prospect saying "We help companies like yours
 * build the lead sourcing and campaign infrastructure so you're not fighting
 * disconnected tools... One system pulls the signals, runs the outbound, and
 * tracks what lands". Every word of that is banned twice over in the same
 * prompt, and it scored 83 out of 100.
 *
 * It happened because the prompt licensed it. The 4ps_followup goal orders the
 * model, in capitals and twice, to open with "...explaining how we help", while
 * the base prompt bans "we help" outright two sections earlier; and it defined
 * the PROMISE beat as "the mechanism in plain language, what happens, in what
 * order, how fast" against a base rule reading "does NOT explain the product,
 * list features... the how is withheld for the reply". Given a rule and a
 * mandated breach of it, the model dropped the rule.
 */
const GEN_SRC = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const RULES_SRC = readFileSync("supabase/functions/_shared/email-rules.ts", "utf8");
const noComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the follow-up prompt no longer licenses what it bans", () => {
  const followUp = GEN_SRC.split("case '4ps_followup':")[1].split("case '4ps_elusive_followup':")[0];

  it("still bans the construction everywhere else in the base prompt", () => {
    expect(GEN_SRC).toContain('"We help,"');
    expect(GEN_SRC).toContain('use "we built" / "we help" / "our platform."');
  });

  it("marks the locked opener as the single exception, not a licence", () => {
    expect(followUp).toContain("fixed quotation");
    expect(followUp).toContain("ONLY place in this email");
    expect(followUp).toContain("buys you no licence for the rest");
  });

  it("stops PROMISE meaning 'describe the product'", () => {
    // The old wording was "The mechanism in plain language. What happens, in
    // what order, how fast." That is an instruction to explain the product,
    // which the base prompt forbids in the same breath.
    expect(followUp).not.toContain("The mechanism in plain language");
    expect(followUp).toContain("What changes for THEM");
    expect(followUp).toContain("not how it works");
  });

  it("quotes back the two shapes it actually produced", () => {
    expect(followUp).toContain("We help companies like yours build the X");
    expect(followUp).toContain("one system pulls the signals");
  });
});

describe("the pitch paragraph is caught where drafts are actually made", () => {
  const gen = noComments(GEN_SRC);

  it("runs the check on every draft, not only in the audit's score", () => {
    expect(gen).toContain("let pitch = findTouchOnePitch(email);");
    expect(gen).toContain("if (pitch.length) {");
  });

  it("regenerates with the clause quoted back", () => {
    expect(gen).toMatch(/\$\{userPrompt\}\\n\$\{pitchRetry\(pitch\)\}/);
    expect(noComments(RULES_SRC)).toContain("The draft explains what you sell:");
  });

  it("keeps the rewrite only when it is better on every axis already guarded", () => {
    expect(gen).toContain("findTouchOnePitch(second).length < pitch.length");
    expect(gen).toContain("!hasPlaceholder(second)");
    expect(gen).toContain("!hasScaffolding(second)");
    expect(gen).toContain("!findUnverifiedClaims(second, proofForClaims).length");
  });

  it("does not refuse the draft over it", () => {
    // A brochure paragraph costs a reply; refusing costs the lead its draft.
    // At a hundred a batch that trade is the wrong way round, so unlike a
    // leaked outline this one keeps the better of the two and ships.
    const after = gen.slice(gen.indexOf("let pitch = findTouchOnePitch(email);"));
    const nextRefusal = after.indexOf("so it was not saved");
    const blockEnd = after.indexOf("Reply-worthiness");
    expect(nextRefusal === -1 || nextRefusal > blockEnd).toBe(true);
  });
});
