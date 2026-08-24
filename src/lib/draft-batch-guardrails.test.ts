import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

  it("does not put a placeholder company name in the subject line", () => {
    // "Quick question — Unknown" was queued against real prospects.
    expect(SRC).toMatch(/unknown\|n\\\/\?a\|none\|null/i);
  });
});
