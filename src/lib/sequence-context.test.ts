import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CADENCE, cadenceStep, sequenceContextPrompt,
} from "../../supabase/functions/_shared/sequence-context.ts";

const code = (path: string) =>
  readFileSync(path, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

/**
 * The four-touch structure a user designs existed only in the preview.
 * process-sequence-step sent one `introduction` and three identical
 * `4ps_followup` calls, each passed the step number as `variantNum` -- which
 * generate-email reads as "this is an A/B variant, so it has to differ in a
 * way worth measuring". A day-7 proof email was being told to differ from
 * the last one for measurement rather than to do its job.
 *
 * The payoff bank and the brief's forbidden claims had the same shape: bound
 * the preview, never loaded by the sender. A user could curate approved proof
 * points, watch them constrain the copy on screen, and have every one ignored
 * at send.
 */
describe("a touch knows which touch it is", () => {
  it("gives each touch its own job", () => {
    expect(CADENCE.map((s) => s.purpose)).toEqual(["hook", "angle", "proof", "breakup"]);
    expect(CADENCE.map((s) => s.day)).toEqual([1, 3, 7, 14]);
    // Every purpose is distinct, or the cadence is four of the same email.
    expect(new Set(CADENCE.map((s) => s.purpose)).size).toBe(CADENCE.length);
  });

  it("maps a touch number to its step, and holds the last one for longer runs", () => {
    expect(cadenceStep(1).purpose).toBe("hook");
    expect(cadenceStep(3).purpose).toBe("proof");
    expect(cadenceStep(4).purpose).toBe("breakup");
    expect(cadenceStep(9).purpose).toBe("breakup");
    // A nonsense number resolves rather than indexing off the end.
    expect(cadenceStep(0).purpose).toBe("hook");
    expect(cadenceStep(-5).purpose).toBe("hook");
  });

  it("says nothing at all when the caller is not writing a sequence", () => {
    /*
     * Every Studio draft and every agent draft goes through the same
     * generator. If this block appeared for them the change would be a
     * rewrite of the whole product's copy rather than an addition.
     */
    expect(sequenceContextPrompt({})).toBe("");
    expect(sequenceContextPrompt({ touchNumber: 0, payoffBank: [], forbiddenClaims: [] })).toBe("");
    // Blank entries are not content.
    expect(sequenceContextPrompt({ payoffBank: [{ content: "  " }], forbiddenClaims: ["", "  "] })).toBe("");
  });

  it("tells the writer the job, not that it is an A/B variant", () => {
    const prompt = sequenceContextPrompt({ touchNumber: 3, touchCount: 4 });
    expect(prompt).toContain("touch 3 of 4");
    expect(prompt).toContain("day 7");
    expect(prompt).toContain('Its job is "proof"');
    expect(prompt.toLowerCase()).not.toContain("a/b");
    expect(prompt.toLowerCase()).not.toContain("worth measuring");
  });

  it("stops a later touch inventing what the earlier ones said", () => {
    // The whole reason the follow-up rules exist: nothing may be quoted from
    // an email this generator never saw.
    const later = sequenceContextPrompt({ touchNumber: 2 });
    expect(later).toContain("do not claim what they said");
    expect(later).toContain('do not open with "following up"');
    const first = sequenceContextPrompt({ touchNumber: 1 });
    expect(first).toContain("Nothing has been sent to this person yet.");
  });

  it("makes the proof points the only source of a number", () => {
    const prompt = sequenceContextPrompt({
      payoffBank: [{ content: "Cut ramp time from 90 to 45 days", source_url: "https://acme.example/case" }],
    });
    expect(prompt).toContain("Cut ramp time from 90 to 45 days");
    expect(prompt).toContain("https://acme.example/case");
    expect(prompt).toContain("A figure that does not appear below may not be written");
  });

  it("passes the forbidden claims through as hard bans", () => {
    const prompt = sequenceContextPrompt({ forbiddenClaims: ["We are the #1 platform"] });
    expect(prompt).toContain("FORBIDDEN CLAIMS");
    expect(prompt).toContain("We are the #1 platform");
    expect(prompt).toContain("in any wording");
  });

  it("caps both lists so one account cannot blow the prompt budget", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ content: `point ${i}` }));
    const prompt = sequenceContextPrompt({ payoffBank: many });
    expect(prompt).toContain("point 19");
    expect(prompt).not.toContain("point 20");
  });
});

describe("the sender reads it, and only for sequence touches", () => {
  const GENERATE = code("supabase/functions/generate-email/index.ts");

  it("takes the touch number separately from the A/B variant number", () => {
    expect(GENERATE).toContain("requestData.touchNumber");
    expect(GENERATE).toContain("requestData.variantNum");
    // Two different inputs, never aliased to each other.
    expect(GENERATE).not.toContain("touchNumber = variantNum");
    expect(GENERATE).not.toContain("variantNum: touchNumber");
  });

  it("appends the block after the research it constrains", () => {
    const research = GENERATE.indexOf("${researchBlock}${NO_HALLUCINATION_RULE}");
    const context = GENERATE.indexOf("sequenceContextPrompt({ touchNumber");
    expect(research).toBeGreaterThan(-1);
    expect(context).toBeGreaterThan(research);
  });

  it("leaves a precision edit alone", () => {
    // An edit is the user's own text coming back; it is not a new touch.
    const editBranch = GENERATE.slice(GENERATE.indexOf("if (isPrecisionEdit) {"), GENERATE.indexOf("if (!isPrecisionEdit) {"));
    expect(editBranch).not.toContain("sequenceContextPrompt");
  });
});
