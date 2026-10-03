import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fallbackSubject, threadedSubject } from "../../supabase/functions/_shared/draft-one";

const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const DRAFT = readFileSync("supabase/functions/_shared/draft-one.ts", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * Thirteen drafts, thirteen subjects, one shape:
 *
 *   Quick question — VDF AI
 *   Quick question — NextDGT Software Solutions
 *   Quick question — Parlawatch AI
 *   ...
 *
 * cleanGeneratedEmail stripped the subject for every goal except
 * `introduction`, so draftForLead's fallback was the only subject the other
 * six ever got. A hundred leads produced a hundred subjects differing only in
 * a company name, out of one sending domain — and it was the exact phrase both
 * prompts ban by name.
 */
describe("the generator writes the subject, for every goal", () => {
  const gen = code(GEN);

  it("keeps what the model wrote instead of stripping it", () => {
    expect(gen).toContain("const preserveSubject = goal !== 'subject_only' && !use4SentenceFramework");
    expect(gen).not.toContain("goal === 'introduction' && !use4SentenceFramework");
  });

  it("asks every goal whose subject is kept to write one", () => {
    /*
     * Counted per goal rather than in total, because the two families of
     * prompt are built differently and the second was missed on the first
     * pass: the four-beat frameworks append BODY_ONLY_RULES, while follow-up,
     * meeting, demo and proposal are built from `base` and end at
     * SIGNOFF_RULES. Five prompts carried the rules and four did not, and
     * `follow-up` was among the four.
     *
     * So this walks the switch and checks each case that keeps its subject,
     * which is every goal except subject_only and the 4-sentence shape.
     */
    const body = GEN.split("switch (goal) {")[1];
    const cases = [...body.matchAll(/case '([a-z0-9_-]+)':([\s\S]*?)(?=\n    case '|\n    default:|\n  }\n)/g)];
    expect(cases.length).toBeGreaterThanOrEqual(9);

    // introduction defers to OUTREACH_STUDIO_SYSTEM_PROMPT, which carries its
    // own numbered SUBJECT beat; subject_only returns only a subject.
    const exempt = new Set(["introduction", "subject_only"]);
    const missing = cases
      .filter(([, name]) => !exempt.has(name))
      .filter(([, , prompt]) => !prompt.includes("${SUBJECT_LINE_RULES}"))
      .map(([, name]) => name);
    expect(missing).toEqual([]);
  });

  it("gives introduction its own subject beat rather than nothing", () => {
    const intro = GEN.split("const OUTREACH_STUDIO_SYSTEM_PROMPT = `")[1].split("`;")[0];
    expect(intro).toContain("SUBJECT");
    expect(intro.toLowerCase()).toContain("quick question");
  });

  it("stops telling them not to write one", () => {
    const body = GEN.split("const BODY_ONLY_RULES = `")[1].split("`;")[0];
    expect(body).not.toContain("Do NOT include a subject line");
    expect(body).toContain("no other headers");
  });

  it("bans in the rules exactly what the fallback used to emit", () => {
    const rules = GEN.split("const SUBJECT_LINE_RULES = `")[1].split("`;")[0];
    expect(rules).toContain("quick question");
    expect(rules).toContain("NEVER");
    expect(rules).toContain("Maximum 6 words");
  });

  it("leaves subject_only alone, which returns a subject and no body", () => {
    expect(gen).toContain("goal !== 'subject_only'");
  });
});

/**
 * A follow-up belongs under the message it follows up on. Threading is not a
 * nicety: Gmail groups on it, so the reader sees what it refers to, and it is
 * reply-focused by construction rather than by asking a model to sound it.
 */
describe("a follow-up continues the thread", () => {
  it("replies to the subject that was actually sent", () => {
    expect(threadedSubject({ state: "awaiting_reply", lastSubject: "outbound stack at acme" }))
      .toBe("Re: outbound stack at acme");
  });

  it("does not stack prefixes", () => {
    expect(threadedSubject({ state: "replied", lastSubject: "Re: Re: outbound stack" }))
      .toBe("Re: outbound stack");
    expect(threadedSubject({ state: "replied", lastSubject: "FWD: outbound stack" }))
      .toBe("Re: outbound stack");
  });

  it("has nothing to continue for a first touch", () => {
    expect(threadedSubject({ state: "never_contacted", lastSubject: "anything" })).toBeNull();
    expect(threadedSubject(null)).toBeNull();
    expect(threadedSubject(undefined)).toBeNull();
  });

  it("does not invent one when the subject was not recorded", () => {
    expect(threadedSubject({ state: "awaiting_reply" })).toBeNull();
    expect(threadedSubject({ state: "awaiting_reply", lastSubject: "   " })).toBeNull();
  });

  it("is consulted before the fallback and after the model", () => {
    const chain = code(DRAFT).split("const subject = split.subject")[1].split(";")[0];
    expect(chain).toContain("threadedSubject(settings.thread)");
    expect(chain).toContain("fallbackSubject(lead.company_name, avoidSubjects)");
    expect(chain.indexOf("threadedSubject")).toBeLessThan(chain.indexOf("fallbackSubject"));
  });
});

describe("the fallback is a last resort, not the default", () => {
  it("never emits a phrase the prompts ban", () => {
    for (const company of ["Acme", "Unknown", "", null, undefined]) {
      const subject = fallbackSubject(company, []).toLowerCase();
      for (const banned of ["quick question", "checking in", "following up", "touching base"]) {
        expect(subject).not.toContain(banned);
      }
    }
  });

  it("keeps a stand-in company name out of the subject", () => {
    for (const junk of ["Unknown", "N/A", "None", "null"]) {
      expect(fallbackSubject(junk, []).toLowerCase()).not.toContain(junk.toLowerCase());
    }
  });

  it("varies rather than repeating a subject the person already has", () => {
    const first = fallbackSubject("Acme", []);
    const second = fallbackSubject("Acme", [first]);
    const third = fallbackSubject("Acme", [first, second]);
    expect(new Set([first, second, third]).size).toBe(3);
    for (const s of [first, second, third]) expect(s.toLowerCase()).toContain("acme");
  });

  it("still answers when every option is spent", () => {
    const spent = ["Acme — one question", "about Acme", "Acme, quick thought", "on Acme's outbound"];
    expect(fallbackSubject("Acme", spent)).toBeTruthy();
    expect(spent).not.toContain(fallbackSubject("Acme", spent));
  });
});
