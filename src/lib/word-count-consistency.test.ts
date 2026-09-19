import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { MIN_WORDS, MAX_WORDS, HARD_MAX_WORDS } from "../../supabase/functions/_shared/email-audit.ts";

/**
 * One number for how long an email may be.
 *
 * The skills and the checker disagreed. Asked to audit an 82-word email the
 * agent called it "over the 75-word target"; the checker enforces 50, 100 and
 * 140. A draft the model called too long passed the audit silently, and a user
 * acting on either number was following a rule the other half of the product
 * did not hold.
 *
 * The first attempt at this test only walked .claude/skills, so it passed
 * while cold-email-playbook.ts still said "50-75 words body only. Absolute
 * ceiling 90 words." and email-rules.ts still said "MUST stay under 75 words"
 * — both injected straight into the agent's prompt. A test that checks half
 * the places a rule can live gives false assurance, which is worse than no
 * test. So this walks the prompt modules too.
 *
 * Aiming tighter than the enforced band is good advice and stays. What is
 * forbidden is asserting a *ceiling* below what the audit enforces, because
 * that is the shape that produces a finding no rule backs.
 */
const ROOTS = [".claude/skills", "supabase/functions/_shared"];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.(md|ts)$/.test(entry)) out.push(p);
  }
  return out;
}

/** Rules the model reads live in prose and string literals, never in comments. */
function ruleLines(path: string): Array<{ n: number; text: string }> {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((text, i) => ({ n: i + 1, text }))
    .filter(({ text }) => !/^\s*(?:\/\/|\*|\/\*)/.test(text));
}

/**
 * A ceiling, stated about an email body, below what is actually enforced.
 * Scoped to lines that mention the body or the email so the genuine limits on
 * other things — a 15-word subject, a 10-word problem statement — do not trip.
 */
function offendingCeilings(text: string): number[] {
  if (!/\b(?:email|emails|body)\b/i.test(text)) return [];
  const found: number[] = [];
  const bounded = /(?:under|max(?:imum)?|ceiling|no more than|must stay under|must be)\D{0,14}?(\d{2})\s*words/gi;
  const ranged = /(\d{2})\s*[-–]\s*(\d{2})\s*words\s*(?:max|maximum|only|body only)/gi;
  for (const m of text.matchAll(bounded)) found.push(Number(m[1]));
  for (const m of text.matchAll(ranged)) found.push(Number(m[2]));
  return found.filter((n) => n >= 20 && n < MAX_WORDS);
}

describe("the enforced band is the only ceiling", () => {
  const files = ROOTS.flatMap(filesUnder);

  it("walks both the skills and the prompt modules", () => {
    expect(files.some((f) => f.startsWith(".claude/skills"))).toBe(true);
    expect(files.some((f) => f.includes("supabase/functions/_shared"))).toBe(true);
    expect(files.length).toBeGreaterThan(20);
  });

  it("nothing states an email-body ceiling below what the audit enforces", () => {
    const offenders = files.flatMap((f) =>
      ruleLines(f)
        .filter(({ text }) => offendingCeilings(text).length > 0)
        .map(({ n, text }) => `${f}:${n} → ${text.trim().slice(0, 90)}`),
    );
    expect(offenders).toEqual([]);
  });

  it("catches the exact lines that slipped through the first time", () => {
    // Proof the rule above actually fires, rather than passing vacuously.
    expect(offendingCeilings("- 50-75 words body only. Absolute ceiling 90 words.")).toContain(75);
    expect(offendingCeilings("- Total email body MUST stay under 75 words.")).toContain(75);
    expect(offendingCeilings("- [ ] First email under 80 words")).toContain(80);
    expect(offendingCeilings("Emails: 60-80 words maximum")).toContain(80);
  });

  it("does not treat the band itself as a ceiling below the band", () => {
    // These two read 90 when MAX_WORDS was 100 and were offenders then. The
    // band moved to 90, so the same sentences are now the rule rather than a
    // tighter claim about it — which is the whole reason the constant is
    // imported here instead of the number being typed in.
    expect(offendingCeilings("- [ ] First email under 90 words")).toEqual([]);
    expect(offendingCeilings("Emails: 60-90 words maximum")).toEqual([]);
  });

  it("leaves limits on other things alone", () => {
    expect(offendingCeilings("1. **15–30 words max**")).toEqual([]);
    expect(offendingCeilings("Rules: Max 15 words, no generic compliments.")).toEqual([]);
    expect(offendingCeilings("- Each problem max 10 words")).toEqual([]);
  });

  it("the constants are what the prose now defers to", () => {
    expect(MIN_WORDS).toBe(50);
    expect(MAX_WORDS).toBe(90);
    expect(HARD_MAX_WORDS).toBe(140);
  });
});
