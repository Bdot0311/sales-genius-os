import { describe, expect, it } from "vitest";
import { thinLeadDraft } from "../../supabase/functions/_shared/first-touch-fallback";

/**
 * The email for a lead research came back thin on.
 *
 * This went out:
 *
 *   Hi Uma,
 *   You're on file at Siftly (YCW22), as Founder & CEO, in Software
 *   Development.
 *   How are you handling outbound for that work?
 *
 * No gate stopped it, and none should have: every word came from the lead's
 * own record, so it is perfectly grounded. It is just a bad email.
 *
 * "You're on file" tells somebody they are in a database. The rest recites
 * their employer, title and industry back at them, which they know. And it was
 * one template, so a hundred go out identical except three fields — a spam
 * pattern before it is a style problem.
 */
describe("the thin-research email", () => {
  const uma = () => thinLeadDraft({
    firstName: "Uma",
    senderName: "Brandon Yakubov",
    company: "Siftly (YCW22)",
    role: "Founder & CEO",
    industry: "Software Development",
  });

  it("never tells somebody they are on file", () => {
    expect(uma().body).not.toMatch(/on file/i);
  });

  it("does not recite their employer, title and industry back at them", () => {
    // The old line was "You're on file at X, as TITLE, in INDUSTRY." A reader
    // learns nothing from their own record, and the email reads as a merge.
    const body = uma().body;
    expect(body).not.toMatch(/at Siftly \(YCW22\), as Founder & CEO, in Software Development/i);
  });

  it("asks rather than asserts, and signs off", () => {
    const body = uma().body;
    expect(body).toMatch(/^Hi Uma,/);
    expect(body).toContain("Brandon Yakubov");
    expect(body).toMatch(/\?/);
  });

  it("claims nothing the record does not hold", () => {
    /*
     * The whole reason this path exists is that there is no research. It may
     * use the role and the industry as framing for a question; it may not
     * state a fact about the company, a number, or anything that happened.
     */
    const body = uma().body.toLowerCase();
    for (const invented of ["raised", "hiring", "launched", "growing", "noticed", "saw that", "recently"]) {
      expect(body, invented).not.toContain(invented);
    }
  });

  it("gives one lead the same shape every time", () => {
    expect(uma().body).toBe(uma().body);
  });

  it("spreads a list across shapes, because identical bodies at volume are a filter signal", () => {
    const bodies = new Set(
      ["Siftly", "griddll", "monar", "Keasy.ai", "Unstack", "Cosmic Labs", "Third Rail", "NextDGT"].map((company) =>
        thinLeadDraft({
          firstName: "Sam", senderName: "Brandon Yakubov",
          company, role: "Founder", industry: "Software Development",
        }).body,
      ),
    );
    expect(bodies.size).toBeGreaterThan(1);
  });

  it("still writes a sane email when the record has only a name", () => {
    const bare = thinLeadDraft({ firstName: "", senderName: "Brandon Yakubov" });
    expect(bare.body).toMatch(/^Hi there,/);
    expect(bare.body).toContain("Brandon Yakubov");
    // No empty "as , in ." left behind by missing fields.
    expect(bare.body).not.toMatch(/\bas ,|\bin \.|,\s*,/);
    expect(bare.subject).toBe("Quick question");
  });

  it("writes a subject, not a bare lowercase company name", () => {
    // "griddll" alone was the subject line, which reads as a typo in an inbox.
    const draft = thinLeadDraft({
      firstName: "Pedro", senderName: "Brandon Yakubov", company: "griddll", role: "Co-Founder",
    });
    expect(draft.subject).not.toBe("griddll");
    expect(draft.subject).toContain("griddll");
    expect(draft.subject.length).toBeGreaterThan("griddll".length + 2);
  });

  it("does not open the body with the words the subject just used", () => {
    /*
     * Subject "Quick question, griddll" over a body opening "Quick question
     * for a co-founder" is the same phrase twice in two inches of screen.
     * The subject travels with the shape so the pair can never collide.
     */
    const companies = ["Siftly", "griddll", "monar", "Keasy.ai", "Unstack", "Cosmic Labs", "Third Rail", "NextDGT"];
    for (const company of companies) {
      for (const role of ["Founder", ""]) {
        for (const industry of ["Software Development", ""]) {
          const draft = thinLeadDraft({ firstName: "Sam", senderName: "B Y", company, role, industry });
          const subjectHead = draft.subject.split(/[,:]/)[0].toLowerCase();
          const bodyLine = draft.body.split("\n")[2].toLowerCase();
          expect(bodyLine.startsWith(subjectHead), `${draft.subject} / ${bodyLine}`).toBe(false);
        }
      }
    }
  });
});
