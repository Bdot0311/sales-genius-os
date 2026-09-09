import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MIN_WORDS, MAX_WORDS, HARD_MAX_WORDS } from "../../supabase/functions/_shared/email-audit.ts";

/**
 * The skills and the checker disagreed about how long an email may be.
 *
 * Asked to audit an 82-word email, the agent reported it "over the 75-word
 * ceiling (90 absolute max)". Those numbers were in the skill files; the
 * checker enforces 50, 100 and 140. So a draft the model called too long
 * passed the audit silently, and a user acting on either one was following a
 * rule the other half of the product did not hold.
 *
 * Craft guidance to aim tighter than the enforced band is good advice and is
 * kept. What is not allowed is a skill asserting a *ceiling* the audit will
 * not enforce, because that is the shape that produces a finding no rule
 * backs.
 */
const SKILLS = ".claude/skills";

function skillFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...skillFiles(p));
    else if (entry.endsWith(".md")) out.push(p);
  }
  return out;
}

describe("the enforced band is the only ceiling", () => {
  const files = skillFiles(SKILLS);

  it("finds the skill files at all, so a passing run means something", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each([
    ["under 75-90 words", /under 75-90 words/i],
    ["a bare 90-word ceiling", /first email under 90 words/i],
    ["60-90 as a maximum", /60-90 words (?:max\b|maximum)/i],
    ["60-90 as a requirement", /must be 60-90 words/i],
  ])("no skill still states %s", (_label, pattern) => {
    const offenders = files.filter((f) => pattern.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("states the enforced range where it gives a target", () => {
    const guidance = readFileSync(`${SKILLS}/cold-email-strategist/SKILL.md`, "utf8");
    expect(guidance).toContain("50-100 enforced");
  });

  it("the constants are what the skills now quote", () => {
    // If these move, the skill prose above has to move with them — which is
    // the whole point of asserting them here rather than trusting a comment.
    expect(MIN_WORDS).toBe(50);
    expect(MAX_WORDS).toBe(100);
    expect(HARD_MAX_WORDS).toBe(140);
  });
});
