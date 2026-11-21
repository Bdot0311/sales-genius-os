import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classifyFailure } from "./draft-failures";
import { classifyFailure as bulkClassify } from "../../supabase/functions/_shared/bulk-run-logic";
import { fallbackSubject } from "../../supabase/functions/_shared/draft-one";
import {
  BANNED_PHRASES,
  enforceSignOff,
  findBannedPhrases,
  findSelfReferentialPeers,
  signOffMismatch,
} from "../../supabase/functions/_shared/email-rules.ts";

/**
 * Drafts taken verbatim from one batch of twenty follow-ups the agent queued
 * for approval. Nothing here is hypothetical: every failure below reached a
 * real approval screen with a real prospect's address on it.
 */
const SIGNED_WITH_RECIPIENT = `Hi Sylvain,

Sent you a note last week about generating qualified leads without adding headcount. We help CEOs like you build an outbound system where one rep can book what four traditionally would.

Bad idea?

Sylvain`;

const SIGNED_WITH_STRANGER = `Hi Julien,

Sent you a note last week about scaling pipeline for a bootstrapped company like Mergify. Worth seeing how?

Matt`;

const SIGNED_WITH_ENTITY = `Hi Martin,

Sent you a note last week about attracting new clients efficiently.

Want to see how we help teams build fast and validate smarter?

BDØT Industries LLC`;

const UNSIGNED = `Hi Seth,

Sent you a note last week about scaling outbound for marketing services teams. We automate that entire process, defining ICP, sourcing verified contacts, and sending email.

Worth two minutes of reading?`;

const CORRECTLY_SIGNED = `Hi Michael,

Sent you a note last week about accelerating outbound. We help sales leaders turn more cold leads into booked calls.

Worth two minutes of reading?

Brandon`;

describe("sign-off identity", () => {
  it("catches a draft signed with the recipient's own name", () => {
    expect(signOffMismatch(SIGNED_WITH_RECIPIENT, "Brandon")).toBe("Sylvain");
  });

  it("catches an invented sender", () => {
    expect(signOffMismatch(SIGNED_WITH_STRANGER, "Brandon")).toBe("Matt");
  });

  it("catches the company signing in place of a person", () => {
    expect(signOffMismatch(SIGNED_WITH_ENTITY, "Brandon")).toBe("BDØT Industries LLC");
  });

  it("catches a draft with no sign-off at all", () => {
    expect(signOffMismatch(UNSIGNED, "Brandon")).toBe("(missing)");
  });

  it("leaves a correct sign-off alone", () => {
    expect(signOffMismatch(CORRECTLY_SIGNED, "Brandon")).toBeNull();
    expect(enforceSignOff(CORRECTLY_SIGNED, "Brandon")).toBe(CORRECTLY_SIGNED);
  });

  it("accepts the full name where the sender supplied one", () => {
    const body = CORRECTLY_SIGNED.replace(/Brandon$/, "Brandon Reid");
    expect(signOffMismatch(body, "Brandon Reid")).toBeNull();
  });

  it("does not mistake a trailing question for a signature", () => {
    const body = "Hi Sam,\n\nSaw the new pricing page.\n\nWorth two minutes of reading?";
    // No signature block at all — reported as missing, never as a wrong name.
    expect(signOffMismatch(body, "Brandon")).toBe("(missing)");
  });

  it("has nothing to say when the caller has no sender name", () => {
    expect(signOffMismatch(SIGNED_WITH_RECIPIENT, "")).toBeNull();
  });
});

describe("sign-off repair", () => {
  it("replaces the wrong name with the sender's first name", () => {
    const fixed = enforceSignOff(SIGNED_WITH_RECIPIENT, "Brandon");
    expect(fixed.trimEnd().endsWith("\nBrandon")).toBe(true);
    expect(signOffMismatch(fixed, "Brandon")).toBeNull();
    // The body above it is untouched.
    expect(fixed).toContain("Bad idea?");
  });

  it("appends a signature when the draft has none", () => {
    const fixed = enforceSignOff(UNSIGNED, "Brandon");
    expect(fixed.trimEnd().endsWith("\n\nBrandon")).toBe(true);
    expect(fixed).toContain("Worth two minutes of reading?");
  });

  it("keeps a title line beneath the name", () => {
    const body = "Hi Sam,\n\nSaw the pricing change.\n\nWorth a look?\n\nMatt\nFounder, Acme";
    const fixed = enforceSignOff(body, "Brandon");
    expect(fixed).toContain("Brandon\nFounder, Acme");
    expect(fixed).not.toContain("Matt");
  });

  it("uses only the first name, never the full one", () => {
    const fixed = enforceSignOff(SIGNED_WITH_STRANGER, "Brandon Reid");
    expect(fixed.trimEnd().endsWith("\nBrandon")).toBe(true);
    expect(fixed).not.toContain("Brandon Reid");
  });
});

describe("banned phrases are checked against output, not just asked for", () => {
  it("flags the filler that shipped in the real batch", () => {
    const hits = findBannedPhrases(SIGNED_WITH_RECIPIENT);
    expect(hits).toContain("without adding headcount");
  });

  it("is case-insensitive", () => {
    const phrase = BANNED_PHRASES[0];
    expect(findBannedPhrases(`Text with ${phrase.toUpperCase()} inside.`)).toContain(phrase);
  });

  it("says nothing about clean copy", () => {
    expect(findBannedPhrases("Saw you moved billing onto Stripe last month.")).toEqual([]);
  });
});

describe("the recipient is never their own peer reference", () => {
  it("catches the company being cited as a customer to itself", () => {
    const body = "We help companies like Purple Horizons build an outbound engine.";
    expect(findSelfReferentialPeers(body, "Purple Horizons")).toEqual([
      "companies like Purple Horizons",
    ]);
  });

  it("matches across punctuation and spacing differences in the name", () => {
    const body = "We help companies like Talka.ai create that pipeline.";
    expect(findSelfReferentialPeers(body, "Talka AI").length).toBe(1);
  });

  it("catches the 'similar to' phrasing too", () => {
    const body = "A team similar to Get BOB secured three new clients.";
    expect(findSelfReferentialPeers(body, "Get BOB").length).toBe(1);
  });

  it("leaves the correct form alone", () => {
    const body = "We help companies like yours build an outbound engine.";
    expect(findSelfReferentialPeers(body, "Purple Horizons")).toEqual([]);
  });

  it("does not fire when a genuinely different company is named", () => {
    const body = "We help companies like Ramp build an outbound engine.";
    expect(findSelfReferentialPeers(body, "Purple Horizons")).toEqual([]);
  });

  it("ignores companies with names too short to match safely", () => {
    expect(findSelfReferentialPeers("companies like AI", "AI")).toEqual([]);
  });
});

describe("repairing the circular peer reference", () => {
  it("turns the recipient's own name into 'yours'", async () => {
    const { repairSelfReferentialPeers } = await import(
      "../../supabase/functions/_shared/email-rules.ts"
    );
    const body = "We help companies like Purple Horizons build an outbound engine.";
    expect(repairSelfReferentialPeers(body, "Purple Horizons")).toBe(
      "We help companies like yours build an outbound engine.",
    );
  });

  it("repairs a punctuated name and leaves the rest of the sentence intact", async () => {
    const { repairSelfReferentialPeers, findSelfReferentialPeers } = await import(
      "../../supabase/functions/_shared/email-rules.ts"
    );
    const body = "We help companies like Talka.ai create that pipeline for real buyers.";
    const fixed = repairSelfReferentialPeers(body, "Talka AI");
    expect(fixed).toBe("We help companies like yours create that pipeline for real buyers.");
    expect(findSelfReferentialPeers(fixed, "Talka AI")).toEqual([]);
  });

  it("leaves a genuine third-party reference alone", async () => {
    const { repairSelfReferentialPeers } = await import(
      "../../supabase/functions/_shared/email-rules.ts"
    );
    const body = "We help companies like Ramp build an outbound engine.";
    expect(repairSelfReferentialPeers(body, "Purple Horizons")).toBe(body);
  });
});

/**
 * These read the function source rather than calling it. generate-email is
 * regenerated by the visual builder from time to time, and a guard that is
 * quietly dropped looks exactly like a guard that works — the batch this file
 * is named for reached approval with every rule present in the repo. Asserting
 * the wiring is the only thing that turns that back into a failing build.
 */
describe("generate-email keeps the output-side guards wired", () => {
  const SRC = readFileSync(
    new URL("../../supabase/functions/generate-email/index.ts", import.meta.url),
    "utf8",
  );

  it("checks banned phrases against the draft, not just the prompt", () => {
    expect(SRC).toContain("findBannedPhrases");
    expect(SRC).toContain("bannedPhraseRetry");
  });

  it("reports unshifted filler as weakness on the response", () => {
    expect(SRC).toContain("banned_phrases");
    expect(SRC).toMatch(/quality_weak:\s*isWeak\(rubric\)\s*\|\|\s*bannedHits\.length/);
  });

  it("corrects a signature that does not name the sender", () => {
    expect(SRC).toContain("signOffMismatch");
    expect(SRC).toContain("enforceSignOff");
  });

  it("rewrites the recipient out of their own peer reference", () => {
    expect(SRC).toContain("findSelfReferentialPeers");
    expect(SRC).toContain("repairSelfReferentialPeers");
  });

  it("no longer hands the follow-up model a finished opening sentence", () => {
    expect(SRC).not.toContain("Sent you a note last week");
  });

  it("no longer hands it the stock closing questions either", () => {
    // All three shipped verbatim across fourteen of twenty drafts.
    expect(SRC).not.toContain('"Bad idea?", "Want the example?"');
    expect(SRC).not.toContain("Worth two minutes of reading?");
  });
});

describe("agent-chat subject fallback", () => {
  const SRC = readFileSync(
    new URL("../../supabase/functions/agent-chat/index.ts", import.meta.url),
    "utf8",
  );
  const RULES_SRC = readFileSync(
    new URL("../../supabase/functions/_shared/email-rules.ts", import.meta.url),
    "utf8",
  );
  const DRAFT_ONE = readFileSync(
    new URL("../../supabase/functions/_shared/draft-one.ts", import.meta.url),
    "utf8",
  );

  it("does not put a placeholder company name in the subject line", () => {
    // "Quick question — Unknown" was queued against real prospects. The list of
    // stand-in values lives in _shared/email-rules.ts behind realValue(); this
    // asserts the subject fallback actually goes through it, and that the list
    // still covers what providers write.
    // The fallback moved to _shared/draft-one.ts with the rest of the draft
    // path, which means it can be run rather than grepped for.
    expect(fallbackSubject("Unknown", []).toLowerCase()).not.toContain("unknown");
    expect(fallbackSubject("Acme", [])).toContain("Acme");
    expect(DRAFT_ONE).toMatch(/realValue\(companyName\)/);
    expect(RULES_SRC).toMatch(/unknown\|n\\\/\?a/i);
    expect(RULES_SRC).toMatch(/\bnone\b/i);
    expect(RULES_SRC).toMatch(/\bnull\b/i);
  });
});

/**
 * Two passes over one lead were reported as fifteen research failures.
 *
 * begin_research_run reserves a lead for ten minutes. The agent queues a
 * research job and a draft job for the same lead, and the draft researches on
 * its own way through generate-email, so the two collide: whichever arrives
 * second is refused the claim. With no brief stored yet, research-lead
 * answered "already ran recently and did not produce a new approved sentence",
 * which the worker's transient pattern did not match, so the job was settled
 * as a permanent failure on its first attempt and counted in the red banner.
 *
 * Proved against postgres: begin_research_run returns a run id to the first
 * caller and NULL to the second, with the reserving row still carrying
 * {"status":"started"}. That status is how the two cases are told apart.
 */
describe("a second pass over the same lead is not a research failure", () => {
  const research = readFileSync("supabase/functions/research-lead/index.ts", "utf8");
  const worker = readFileSync("supabase/functions/process-agent-jobs/index.ts", "utf8");

  const IN_FLIGHT = "Research for this company is already running in another pass. Temporarily unavailable, try again shortly.";
  const EMPTY = "Research for this company already ran recently and did not produce a new approved sentence.";

  it("tells a run that is still working from one that came back empty", () => {
    expect(research).toContain(IN_FLIGHT);
    expect(research).toContain(EMPTY);
    // The reserving row carries this until the run that owns it writes its
    // receipt. Without reading it, both cases answer the same way.
    expect(research).toMatch(/\.status === "started"/);
  });

  it("hands the item back instead of failing it", () => {
    expect(bulkClassify(IN_FLIGHT)).toBe("transient");
  });

  it("still fails the pass that genuinely found nothing", () => {
    // Retrying this one returns the same answer forever, so it must not loop.
    expect(bulkClassify(EMPTY)).toBe("permanent");
  });

  it("both workers decide with the same classifier", () => {
    /*
     * They each had their own, and disagreed. The bulk worker retried "the
     * reply rubric did not return a score" and the shell called it retryable;
     * the agent worker failed it permanently on the first attempt, which is
     * what "4 scorer didn't respond" was. A second copy of this rule is how
     * that happened, so there must not be one.
     */
    expect(worker).toContain('classifyFailure as classifyWorkerFailure');
    expect(worker).not.toMatch(/const TRANSIENT_FAILURE\s*=/);
    for (const message of [
      "The reply rubric did not return a score, so this draft was not released.",
      "The model gave no response from the model.",
      "Provider unreachable",
      IN_FLIGHT,
    ]) {
      expect(bulkClassify(message), message).toBe("transient");
    }
    // And the agent worker retries a rate limit, which the shared classifier
    // files separately from the rest.
    expect(bulkClassify("Rate limit reached")).toBe("rate_limit");
    expect(worker).toMatch(/kind === "transient" \|\| kind === "rate_limit"/);
  });

  it("reads as waiting rather than as a failure", () => {
    expect(classifyFailure(IN_FLIGHT)).toEqual({ label: "waiting on research already in progress", retryable: true });
    expect(classifyFailure(EMPTY).retryable).toBe(false);
  });

  it("the bulk worker treats it the same way", () => {
    expect(bulkClassify(IN_FLIGHT)).toBe("transient");
    expect(bulkClassify(EMPTY)).toBe("permanent");
  });
});
