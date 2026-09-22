import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RESUME_MESSAGE, STOPPED_SHORT_MARKER, canResume } from "./agent-resume";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const PAGE = readFileSync("src/pages/AgentChat.tsx", "utf8");

/**
 * #254 made a run that stops short say so. This is the other half: continuing
 * it should be one tap, not the user remembering and retyping the job.
 */
describe("a run that stopped short can be picked back up", () => {
  it("recognises the sentence the function actually writes", () => {
    // Two copies of a string drift, and the one that drifts is the one nobody
    // reads. This is the whole reason the marker lives in one module.
    expect(AGENT).toContain(STOPPED_SHORT_MARKER);
  });

  it("reads the state off the conversation, not off a variable", () => {
    // So it survives a reload, a second tab, and coming back tomorrow.
    expect(canResume([{ role: "assistant", content: `Did 10. ${STOPPED_SHORT_MARKER}` }])).toBe(true);
    expect(canResume([{ role: "assistant", content: "All done." }])).toBe(false);
    expect(canResume([])).toBe(false);
  });

  it("only offers to resume the most recent turn", () => {
    // An older stop followed by a finished turn is finished.
    expect(
      canResume([
        { role: "assistant", content: `Did 10. ${STOPPED_SHORT_MARKER}` },
        { role: "user", content: "keep going" },
        { role: "assistant", content: "Finished the rest." },
      ]),
    ).toBe(false);
  });

  it("tells the agent not to redo the work it already did", () => {
    expect(RESUME_MESSAGE).toMatch(/do not repeat/i);
    expect(RESUME_MESSAGE).toMatch(/where you stopped/i);
  });

  it("the page offers it", () => {
    expect(PAGE).toContain("canResume");
    expect(PAGE).toContain("RESUME_MESSAGE");
    // And never while something is already running.
    expect(PAGE).toMatch(/resumable\s*&&\s*!sending\s*&&\s*!runActive/);
  });
});
