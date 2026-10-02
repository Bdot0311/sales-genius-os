import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyFailure, describeFailures, summariseFailures } from "./draft-failures";

const RULES = readFileSync("supabase/functions/_shared/email-rules.ts", "utf8");
const GEN = readFileSync("supabase/functions/generate-email/index.ts", "utf8");
const HOOK = readFileSync("src/hooks/use-background-work.tsx", "utf8");
const BAR = readFileSync("src/components/dashboard/BackgroundWorkBar.tsx", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** The detector, lifted out of the Deno module so it can actually be run. */
const detector = (() => {
  const block = RULES.slice(
    RULES.indexOf("const SCAFFOLD_LABEL_REGEX"),
    RULES.indexOf("export const NO_SCAFFOLDING_RETRY"),
  );
  const js = block
    .replace(/export /g, "")
    .replace(/\(email: string\): string\[\]/g, "(email)")
    .replace(/\(email: string\): boolean/g, "(email)");
  return new Function(`${js}; return { findScaffolding, hasScaffolding };`)() as {
    findScaffolding: (s: string) => string[];
    hasScaffolding: (s: string) => boolean;
  };
})();

/**
 * The draft that reached the composer, reproduced.
 *
 * Three failures in one message: the 4P's beat names printed as headings, the
 * markdown that wraps them in mail with no renderer, and the model reporting
 * its own compliance to whoever wrote the prompt. The body-only rules covered
 * greetings, sign-offs and placeholder tokens, and the quality score passed it
 * at 83 out of 100.
 */
const LEAKED = `I reached out the other day but likely didn't do the best job explaining how we help.

**PROBLEM:** Your platform automates hiring workflows, but filtering candidates who don't fit still consumes cycles before they reach scheduling.

**PROMISE:** We provide a unified outbound platform that sources high-quality, ready-to-buy leads.

**PROOF:** (No specific proof provided in the input, so skipping this section as per instructions.)

**PROPOSAL:** Is this a challenge you are actively addressing?`;

describe("an email that is visibly not an email", () => {
  it("catches the draft that actually shipped", () => {
    expect(detector.hasScaffolding(LEAKED)).toBe(true);
  });

  it("names all three failures, not just the first", () => {
    const found = detector.findScaffolding(LEAKED).join(" ");
    expect(found).toContain("PROBLEM");
    expect(found).toContain("**");
    expect(found).toContain("skipping this section");
  });

  it("catches a beat label with no markdown around it", () => {
    expect(detector.hasScaffolding("PROPOSAL: Worth a look?")).toBe(true);
    expect(detector.hasScaffolding("## TRIGGER: you raised funding")).toBe(true);
  });

  it("catches markdown on its own", () => {
    expect(detector.hasScaffolding("We **already** run this for three teams.")).toBe(true);
  });

  it("catches the model talking to the prompt's author", () => {
    expect(detector.hasScaffolding("(No specific metric provided in the input, so omitting this part.)")).toBe(true);
    expect(detector.hasScaffolding("(Skipping this section as instructed.)")).toBe(true);
  });
});

/**
 * A guard that fires on real emails is worse than none: it would refuse good
 * drafts and the user would see them as failures.
 */
describe("it leaves a real email alone", () => {
  it("passes a clean draft", () => {
    const clean = `I reached out the other day but likely didn't do the best job explaining how we help.

Filtering candidates who don't fit still burns cycles before anyone reaches scheduling.

Most teams your size route that upstream instead.

Is that something you're actively working on?`;
    expect(detector.findScaffolding(clean)).toEqual([]);
  });

  it("allows an ordinary parenthetical", () => {
    expect(detector.hasScaffolding("We ran this with two teams (both under 50 people) last quarter.")).toBe(false);
  });

  it("allows the words themselves in a sentence", () => {
    // Lower case and mid-sentence is prose; upper case at the start of a line
    // followed by a colon is the outline showing through.
    expect(detector.hasScaffolding("Hiring is the problem: you said so yourself.")).toBe(false);
    expect(detector.hasScaffolding("The proof: three teams shipped it.")).toBe(false);
  });
});

describe("the prompt says the beats are not headings", () => {
  const body = GEN.split("const BODY_ONLY_RULES = `")[1].split("`;")[0];

  it("tells the model what the beat names are for", () => {
    expect(body).toContain("are how you plan the email");
    expect(body).toContain("NOT headings");
    expect(body).toContain("Never\n  print those words");
  });

  it("says there is no renderer", () => {
    expect(body).toContain("No markdown");
    expect(body).toContain("asterisks arrive as");
  });

  it("says to skip silently rather than announce the skip", () => {
    expect(body).toContain("leave it out silently");
    expect(body).toContain("may address the\n  person who wrote these instructions");
  });
});

describe("a leaked outline is regenerated once, then refused", () => {
  const gen = code(GEN);

  it("retries with the mistake named", () => {
    expect(gen).toContain("if (hasScaffolding(email)) {");
    expect(gen).toContain("NO_SCAFFOLDING_RETRY");
  });

  it("only takes a retry that actually fixed it", () => {
    expect(gen).toContain("if (second && !hasScaffolding(second) && !hasPlaceholder(second)) email = second;");
  });

  it("refuses rather than saving one that survived", () => {
    // Not a quality judgement: the user reading "1 failed" is better served
    // than the prospect reading a form.
    expect(gen).toContain("scaffolding survived the retry");
    expect(gen).toContain("printed its own outline");
  });

  it("checks before the cleaner runs, so the cleaner cannot hide it", () => {
    const scaffoldAt = gen.indexOf("hasScaffolding(email)");
    const cleanAt = gen.indexOf("cleanGeneratedEmail(email, preserveSubject)");
    expect(scaffoldAt).toBeGreaterThan(-1);
    expect(scaffoldAt).toBeLessThan(cleanAt);
  });
});

/**
 * "3 failed" was the entire report, which is the same failure as the "0/12
 * drafted" that took hours to explain from screenshots. The worker had written
 * the reason onto every row the whole time.
 */
describe("a failure says why", () => {
  it("reads the reasons, not just the count", () => {
    expect(code(HOOK)).toContain('.from("agent_job_items" as any)');
    expect(code(HOOK)).toContain('.eq("status", "failed")');
    expect(code(HOOK)).toContain("summariseFailures(");
  });

  it("only asks when something has failed", () => {
    // This polls every five seconds; a second query per tick to confirm an
    // empty set is a cost with no reader.
    expect(code(HOOK)).toContain("if (withFailures.length === 0)");
  });

  it("shows them in the shell", () => {
    expect(code(BAR)).toContain("describeFailures(failures)");
    expect(code(BAR)).toContain("{failed} failed");
  });

  it("separates a refusal from a crash", () => {
    expect(classifyFailure("The draft kept inventing figures it cannot back (40%), so it was not saved.").retryable).toBe(false);
    expect(classifyFailure("AI is rate limited right now. Wait a moment and try again.").retryable).toBe(true);
  });

  it("counts reasons rather than listing every row", () => {
    const summary = summariseFailures([
      "The draft kept inventing figures it cannot back (40%), so it was not saved.",
      "The draft kept inventing figures it cannot back (3 years), so it was not saved.",
      "AI is rate limited right now.",
    ]);
    expect(describeFailures(summary)).toBe("2 invented a figure it can't back, 1 AI rate limited");
  });

  it("shows an unrecognised reason rather than bucketing it as other", () => {
    // The whole failure of the old line was that it gave a number and nothing
    // else; replacing that with "3 other" would repeat it.
    const summary = summariseFailures(["Postgres connection reset by peer. Retry later."]);
    expect(summary[0].label).toBe("Postgres connection reset by peer.");
  });
});
