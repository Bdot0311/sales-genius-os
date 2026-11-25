import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const RAW = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
/** Comments stripped, so an assertion cannot match its own explanation. */
const CODE = RAW.split("\n").filter((line) => {
  const t = line.trim();
  return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
}).join("\n");

/**
 * "I want no fails."
 *
 * Four exits returned an error and nothing else, and all four are the MODEL
 * failing rather than the lead:
 *
 *   the model printed its own outline, twice
 *   it left a placeholder unfilled, twice
 *   it kept making a claim the research does not carry
 *   the quality checker still had blockers
 *
 * The lead record still held a name, a company, a role and an industry --
 * everything thinLeadDraft has ever needed. releaseThinLead() did exactly
 * this already, but it is declared seven hundred lines below and three of the
 * four exits return before reaching it, so the lead got nothing.
 *
 * Retrying is the wrong answer: it spends another generation to arrive at the
 * same place. A draft the owner can read and edit beats a counter going up.
 */
describe("every model failure still leaves a draft", () => {
  const CASES: Array<[rule: string, errorFragment: string]> = [
    // The fragment must be unique to the ERROR return: "printed its own
    // outline" also appears in the fallback's own evidence string, so the
    // first version of this test matched the call it was meant to measure.
    ["printed_outline", "instead of an email, twice, so it was not saved"],
    ["unfilled_placeholder", "came back with an unfilled placeholder"],
    ["unsupported_prospect_claim", "the research does not say"],
    ["quality_checker", "still fails the quality checker"],
  ];

  for (const [rule, errorFragment] of CASES) {
    it(`${rule}: writes a fallback before it reports a failure`, () => {
      const call = CODE.indexOf(`lastResortDraft(\n        "${rule}"`);
      expect(call, `no lastResortDraft("${rule}") call`).toBeGreaterThan(-1);
      const errorAt = CODE.indexOf(errorFragment, call);
      expect(errorAt, `error string not found after the ${rule} call`).toBeGreaterThan(call);
      // The release is taken when it is available, not computed and dropped.
      const between = CODE.slice(call, errorAt);
      expect(between, rule).toContain("if (released) return released;");
    });
  }

  /**
   * Scoped to the helper's own body. The first version asserted these
   * against the whole file and passed with them deleted, because the
   * thin-research early return seven hundred lines earlier carries the same
   * two fields.
   */
  const helperBody = (() => {
    const start = CODE.indexOf("const lastResortDraft = (");
    expect(start, "lastResortDraft is not declared").toBeGreaterThan(-1);
    const end = CODE.indexOf("\n    };", start);
    expect(end, "could not find the end of lastResortDraft").toBeGreaterThan(start);
    return CODE.slice(start, end);
  })();

  it("marks the fallback for review instead of passing it off as a good draft", () => {
    expect(helperBody).toContain('quality_status: "needs_review"');
    expect(helperBody).toContain("thin_research: true");
    // The real cause travels with it, so the owner knows why it is plain.
    expect(helperBody).toContain("quality_findings: [{ rule, evidence, fix }]");
  });

  it("returns a draft, not an error", () => {
    // The whole point: this response has an `email` and no `error`.
    expect(helperBody).toContain("email: `Subject: ${thin.subject}");
    expect(helperBody).not.toContain("error:");
  });

  it("never replaces an edit the user asked for with a template", () => {
    /*
     * A precision edit is the user's own text coming back changed. Handing
     * them a generic first touch instead would be worse than the error, and
     * a subject-only call has no body to fall back to.
     */
    expect(helperBody).toContain(
      'if (isPrecisionEditPre || goal === "subject_only" || !resolvedSenderName) return null;',
    );
  });

  it("still fails honestly when there is no sender name to sign off with", () => {
    // thinLeadDraft needs one, and "no sender name set" is already its own
    // honest failure with its own fix.
    const guard = CODE.indexOf("!resolvedSenderName) return null;");
    expect(guard).toBeGreaterThan(-1);
    // Every original error return survives as the path taken when it is null.
    for (const [, errorFragment] of CASES) {
      expect(CODE, errorFragment).toContain(errorFragment);
    }
  });

  it("keeps the grounding gates in front of it", () => {
    /*
     * This is a fallback, not a bypass. The draft it writes claims nothing
     * about the company beyond the lead's own record, which is why no
     * evidence gate applies to it -- and the gates that refused the model's
     * draft still refused it.
     */
    expect(CODE).toContain("thinLeadDraft({");
    expect(CODE).not.toContain("skipGrounding");
  });
});
