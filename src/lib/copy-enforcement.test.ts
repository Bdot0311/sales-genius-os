import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  findClippedOpeners,
  findNameMismatches,
  findBannedPhrases,
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
