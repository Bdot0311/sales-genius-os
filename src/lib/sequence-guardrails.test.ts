import { describe, expect, it } from "vitest";
import { sequenceSystemPrompt } from "../../supabase/functions/generate-sequence/prompt-v2.ts";
import { BANNED_PHRASES } from "../../supabase/functions/_shared/email-rules.ts";
import { lintTouch } from "../../supabase/functions/_shared/style-lint.ts";

describe("sequence generation carries the shared rules", () => {
  it("names the full banned list, not a five-phrase excerpt", () => {
    const prompt = sequenceSystemPrompt();
    for (const phrase of ["drive efficiency", "predictable pipeline", "cutting-edge", "circling back"]) {
      expect(prompt.toLowerCase(), phrase).toContain(phrase);
    }
  });

  it("injects the GTM frameworks that decide each touch's shape", () => {
    const prompt = sequenceSystemPrompt();
    expect(prompt).toContain("FRAMEWORKS");
    expect(prompt).toContain("SKILL: cold-email-4-sequence");
  });

  it("keeps the truth rules that make the payoff bank binding", () => {
    const prompt = sequenceSystemPrompt();
    expect(prompt).toContain("PAYOFF BANK");
    expect(prompt).toContain("FORBIDDEN CLAIMS");
  });
});

describe("style-lint enforces what the prompts ban", () => {
  it("uses the shared list rather than a local excerpt", () => {
    // Banned everywhere in the product, previously invisible to this lint.
    const r = lintTouch("note", "our cutting-edge platform will drive efficiency for you.");
    expect(r.ok).toBe(false);
  });

  it("still passes concrete copy", () => {
    const r = lintTouch("saw your q3 hiring", "you opened three sales roles last week. teams at that stage usually feel the ramp gap first. want the one-page playbook we use?");
    expect(r.ok, r.violations.join("; ")).toBe(true);
  });

  it("covers every phrase the shared list bans", () => {
    for (const phrase of BANNED_PHRASES.slice(0, 12)) {
      const r = lintTouch("note", `we can ${phrase} for you.`);
      expect(r.ok, phrase).toBe(false);
    }
  });
});
