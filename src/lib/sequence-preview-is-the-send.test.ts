import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const code = (path: string) =>
  readFileSync(path, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const PREVIEW = code("supabase/functions/generate-sequence/index.ts");
const SEND = code("supabase/functions/process-sequence-step/index.ts");
const BUILDER = code("src/components/sequences/AiSequenceBuilder.tsx");

/**
 * Step three of three.
 *
 * The builder previewed copy from its own model call, which shared four
 * modules with generate-email where generate-email imports the whole guard
 * stack. Every fix to the email writer landed on what gets sent and on none
 * of what the user was shown, so the two drifted further apart with each one.
 */
describe("the preview is written by the generator that sends", () => {
  it("calls generate-email, not its own model", () => {
    expect(PREVIEW).toContain("functions/v1/generate-email");
    expect(PREVIEW).toContain("personalizedOutreach");
    // The old path and everything that fed it is gone, not left dangling.
    expect(PREVIEW).not.toContain("callGateway");
    expect(PREVIEW).not.toContain("parseTouches");
    expect(PREVIEW).not.toContain("sequenceSystemPrompt");
    expect(PREVIEW).not.toContain("lintTouch");
  });

  it("passes the loaded bank, not an empty one", () => {
    /*
     * The first version of this asserted the word "payoffBank" appeared, and
     * passed with the call changed to `payoffBank: []` -- it was matching the
     * key, not the value.
     */
    expect(PREVIEW).toContain("touchCount: cadence.length, payoffBank,");
    expect(SEND).toContain("payoffBank,");
    expect(PREVIEW).not.toMatch(/payoffBank:\s*\[\]/);
    expect(SEND).not.toMatch(/payoffBank:\s*\[\]/);
  });

  it("loads the bank on the same plans at both ends", () => {
    /*
     * The preview read was behind `if (growthPlus)` while the sender loads it
     * for everyone, so a Starter account would preview without its proof
     * points and send with them.
     */
    expect(PREVIEW).not.toContain("if (growthPlus) {\n      const { data } = await supabase.from(\"payoff_bank\")");
    const bankRead = PREVIEW.slice(PREVIEW.indexOf('from("payoff_bank")') - 300, PREVIEW.indexOf('from("payoff_bank")'));
    expect(bankRead).not.toContain("if (growthPlus)");
  });

  it("passes the same arguments the sender passes", () => {
    for (const arg of ["touchNumber", "touchCount", "lead: { id"]) {
      expect(PREVIEW, `preview missing ${arg}`).toContain(arg);
      expect(SEND, `sender missing ${arg}`).toContain(arg);
    }
    // Including the goal mapping, or touch one would differ between them.
    const mapping = '> 1 ? "4ps_followup" : "introduction"';
    expect(PREVIEW).toContain(mapping);
    expect(SEND).toContain(mapping);
  });

  it("both read the one cadence", () => {
    expect(PREVIEW).toContain('from "../_shared/sequence-context.ts"');
    expect(PREVIEW).toContain("CADENCE");
  });

  it("does not hold the preview to a rule the send is not", () => {
    /*
     * This screen has a briefId and could pass forbiddenClaims. The sender
     * cannot -- email_sequences has no brief_id -- so passing them would put
     * the preview back to showing copy held to a stricter rule than the real
     * email, which is the exact drift being removed.
     */
    expect(PREVIEW).not.toMatch(/forbiddenClaims\s*:/);
    expect(SEND).not.toMatch(/forbiddenClaims\s*:/);
  });

  it("runs the first touch alone so the rest read cached research", () => {
    expect(PREVIEW).toContain("const firstTouch = await writeTouch(cadence[0], 1);");
    expect(PREVIEW).toContain("await Promise.all(cadence.slice(1)");
  });

  it("shows a refused touch as refused rather than filling it in", () => {
    expect(PREVIEW).toContain("blocked: true");
    expect(PREVIEW).toContain("reason:");
    expect(BUILDER).toContain("This touch was not written, so it will not be saved or sent.");
  });
});

describe("a refused touch never becomes a step", () => {
  it("filters before building steps, naming and scheduling", () => {
    /*
     * A refused touch has an empty subject and body. Saved as a step it
     * would enrol people into something that sends nothing and blocks every
     * step behind it.
     */
    expect(BUILDER).toContain("const writable = touches.filter((t) => !t.blocked && t.subject.trim() && t.body.trim());");
    expect(BUILDER).toContain("stepsFromTouches(writable)");
    expect(BUILDER).toContain("firstActionAt(writable)");
    expect(BUILDER).not.toContain("stepsFromTouches(touches)");
    expect(BUILDER).not.toContain("firstActionAt(touches)");
  });

  it("will not offer to enrol anyone when nothing was written", () => {
    expect(BUILDER).toContain("writableTouches.length === 0");
  });

  it("counts what was written, not what was asked for", () => {
    expect(BUILDER).toContain("const written = t.filter((touch) => !touch.blocked).length;");
    expect(BUILDER).toContain("Generated ${written} of ${t.length} touches");
  });
});
