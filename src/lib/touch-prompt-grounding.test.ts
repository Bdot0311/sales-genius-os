import { describe, expect, it } from "vitest";
import {
  buildTouchPrompt,
  PLAYBOOK_SYSTEM_RULES,
} from "../../supabase/functions/_shared/cold-email-playbook.ts";

/**
 * The agent invented facts about companies, and this is where it was told to.
 *
 * Two non-negotiable rules require a specific truth about the prospect, and
 * research is the only thing that supplies one. Research returns nothing
 * whenever a provider is unset, out of credits or silently failing, which
 * this product's own ENVIRONMENT.md documents for four of them.
 *
 * agent-run used to append that empty result to the prompt, which is the same
 * as saying nothing. The model was left under an order to state a specific
 * truth about a company it had been told nothing about. There is exactly one
 * way to satisfy that instruction, and the model took it. It was obeying.
 *
 * So the empty case has to be said out loud, the way the `signals` field has
 * said it all along.
 */

const base = {
  firstName: "Dana",
  jobTitle: "VP Sales",
  companyName: "Acme",
  industry: "logistics",
  senderFirstName: "Brandon",
};

describe("the touch prompt never demands a fact it did not supply", () => {
  it("passes real research through when there is some", () => {
    const prompt = buildTouchPrompt({
      ...base,
      research: "- What they do: route planning for freight brokers",
    });
    expect(prompt).toContain("route planning for freight brokers");
    expect(prompt).not.toContain("none available");
  });

  /*
   * The load-bearing assertion. Empty research must produce an explicit
   * refusal instruction, not silence.
   */
  for (const empty of [undefined, null, "", "   "]) {
    it(`states the empty case when research is ${JSON.stringify(empty)}`, () => {
      const prompt = buildTouchPrompt({ ...base, research: empty });
      expect(prompt).toContain("RESEARCH:");
      expect(prompt).toContain("none available");
      expect(prompt.toLowerCase()).toContain("do not state");
    });
  }

  it("tells the model what to do instead, not only what to avoid", () => {
    const prompt = buildTouchPrompt({ ...base, research: "" });
    // A prohibition with no alternative is how a model freezes or ignores it.
    expect(prompt.toLowerCase()).toContain("role and industry");
  });

  /*
   * Mirrors the guard the signals field has always had. If that one is ever
   * removed, the same failure returns by a different door.
   */
  it("keeps the matching guard on signals", () => {
    const prompt = buildTouchPrompt({ ...base, signals: [] });
    expect(prompt).toContain("do not invent one");
  });

  it("still passes signals through when supplied", () => {
    const prompt = buildTouchPrompt({ ...base, signals: ["hiring 3 AEs"] });
    expect(prompt).toContain("hiring 3 AEs");
    expect(prompt).not.toContain("do not invent one");
  });
});

describe("the rules that require a specific detail say where it may come from", () => {
  /*
   * These two rules are what make an empty research block dangerous. Either
   * may be reworded, but neither may go back to demanding a company-specific
   * truth unconditionally.
   */
  it("qualifies the one-specific-detail rule", () => {
    expect(PLAYBOOK_SYSTEM_RULES).toContain("Reference ONE specific detail about the prospect");
    expect(PLAYBOOK_SYSTEM_RULES).toContain("their role or industry");
    expect(PLAYBOOK_SYSTEM_RULES).toContain(
      "Never state anything about this specific company that was not supplied to you",
    );
  });

  it("qualifies touch 1's grounding instruction", () => {
    const touchOne = PLAYBOOK_SYSTEM_RULES.slice(PLAYBOOK_SYSTEM_RULES.indexOf("Touch 1 (day 0)"));
    expect(touchOne).toContain("when research supplies it");
    expect(touchOne).toContain("role or industry when it does not");
  });
});
