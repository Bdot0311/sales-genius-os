import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeSkillContext, skillNamesUsed } from "../../supabase/functions/_shared/email-skills";
import { EMAIL_SKILLS } from "../../supabase/functions/_shared/skills.generated";

const SKILL = readFileSync(".claude/skills/objection-replies/SKILL.md", "utf8");
const AGENT_RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");

/**
 * agent-run classifies a reply into pricing / timing / competitor / authority /
 * status_quo / no_need, then wrote the answer from a prompt consisting of a
 * name, a persona and a tone. Every other path that writes email carries the
 * house rules; the three reply paths carried none of them.
 */
describe("the objection skill is real and bundled", () => {
  it("ships in the compiled bundle", () => {
    expect(EMAIL_SKILLS).toHaveProperty("objection-replies");
  });

  it("reaches the path that answers objections, and only that one", () => {
    /*
     * This asserted it reached every path, which is how it came to be injected
     * into first touches: guidance on answering a pricing objection, in a
     * prompt writing to someone who has said nothing, reads as licence to
     * pre-argue. agent-run classifies the objection and asks for this goal,
     * so the material arrives exactly where it is the material.
     */
    expect(skillNamesUsed({ goal: "objection" })).toContain("objection-replies");
    expect(composeSkillContext({ goal: "objection" })).toContain("--- SKILL: objection-replies ---");
    for (const goal of ["introduction", "4ts", "meeting"]) {
      expect(skillNamesUsed({ goal }), goal).not.toContain("objection-replies");
    }
  });

  it("covers the types agent-run actually classifies", () => {
    // The taxonomy is set in the classifier prompt; a skill that named
    // different types would be answering a question nobody asked.
    for (const type of ["Pricing", "Timing", "Competitor", "Authority", "Status quo", "No need"]) {
      expect(SKILL, type).toContain(type);
    }
    for (const type of ["pricing", "timing", "competitor", "authority", "status_quo", "no_need"]) {
      expect(AGENT_RUN, type).toContain(type);
    }
  });

  it("is about replying, not about calls", () => {
    // Most objection material assumes a live conversation. Half its advice —
    // pausing, reading tone — cannot be executed in an email.
    expect(SKILL).toContain("A reply, not a call");
  });

  it("forbids inventing the proof, like every other guard here", () => {
    expect(SKILL).toContain("NEVER invent a customer name, a percentage, a metric or a case study");
    expect(SKILL).toContain("prepared guidance supplied with the request");
  });

  it("defers to the objection library rather than competing with it", () => {
    // objection_entries carries positioning, talk tracks and permitted proof
    // points. The skill supplies technique; the library supplies claims.
    expect(AGENT_RUN).toContain("objection_entries");
    expect(AGENT_RUN).toContain("Never invent a customer name, a metric, or a statistic that is not listed");
  });

  it("refuses the moves that cost more than the deal", () => {
    expect(SKILL).toContain("NEVER discount");
    expect(SKILL).toContain("NEVER answer a soft no with a harder ask");
  });
});

describe("the agent's reply paths carry the house rules", () => {
  it("the objection reply loads the skills and the banned list", () => {
    const block = AGENT_RUN.slice(AGENT_RUN.indexOf("const objectionSystemPrompt"));
    expect(block).toContain("bannedPhrasesBlock()");
    expect(block).toContain('composeSkillContext({ goal: "objection" })');
  });

  it("tells the writer which objection was classified", () => {
    // The type is decided two steps earlier and was never passed on, so the
    // per-type guidance had nothing to key off.
    expect(AGENT_RUN).toContain("Objection type, as classified:");
  });

  it("the interested reply is covered too", () => {
    const block = AGENT_RUN.slice(AGENT_RUN.indexOf("const replySystemPrompt"));
    expect(block.slice(0, 400)).toContain("bannedPhrasesBlock()");
  });

  it("the meeting reply at least carries the banned list", () => {
    const block = AGENT_RUN.slice(AGENT_RUN.indexOf("const meetingSystemPrompt"));
    expect(block.slice(0, 300)).toContain("bannedPhrasesBlock()");
  });

  it("leaves the first-touch path alone, which already had them", () => {
    // It gets them through playbookSystemRules(), which composes the bundle.
    expect(AGENT_RUN).toContain("playbookSystemRules()");
  });
});
