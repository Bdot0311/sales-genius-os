import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isPermanentSeedFailure,
  isPlatformSeed,
  readFailureEndsTest,
  seedFailureMessage,
} from "../../supabase/functions/_shared/placement-seed";

const FN = readFileSync("supabase/functions/run-placement-test/index.ts", "utf8");
const PANEL = readFileSync("src/components/deliverability/PlacementPanel.tsx", "utf8");
const PLATFORM = "outreign.seed@gmail.com";

/**
 * "Inbox placement doesn't work — the email lands but it doesn't track."
 *
 * The send worked. The read did not, and the user was told:
 *
 *   "The test email was sent, but outreign.seed@gmail.com could not be read to
 *    see where it landed. Reconnect that mailbox and run the test again."
 *
 * outreign.seed@gmail.com is the PLATFORM seed. It lives in an operator secret
 * and appears nowhere in the customer's integrations — there is no button in
 * the product that reconnects it. They were handed an instruction they could
 * not carry out, about a mailbox they do not own, while the actual Google
 * error went to a log they cannot read.
 */
describe("telling the right person whose problem it is", () => {
  it("recognises the shared platform inbox", () => {
    expect(isPlatformSeed(PLATFORM, PLATFORM)).toBe(true);
    expect(isPlatformSeed("  OutReign.Seed@Gmail.com ", PLATFORM)).toBe(true);
  });

  it("does not mistake the user's own mailbox for it", () => {
    expect(isPlatformSeed("brandon@bdotindustries.com", PLATFORM)).toBe(false);
    expect(isPlatformSeed("brandon@bdotindustries.com", null)).toBe(false);
  });

  it("never tells them to reconnect a mailbox they do not own", () => {
    const msg = seedFailureMessage({ seedEmail: PLATFORM, platformAddress: PLATFORM });
    expect(msg).not.toMatch(/reconnect/i);
    expect(msg).toMatch(/on us rather than on your setup/i);
  });

  it("does tell them to reconnect when it is genuinely theirs", () => {
    const msg = seedFailureMessage({ seedEmail: "brandon@bdotindustries.com", platformAddress: PLATFORM });
    expect(msg).toMatch(/reconnecting it on the Integrations page/i);
    expect(msg).toContain("brandon@bdotindustries.com");
  });

  it("passes on what the token exchange actually said", () => {
    const msg = seedFailureMessage({
      seedEmail: PLATFORM,
      platformAddress: PLATFORM,
      reason: "Google refused the token: invalid_grant",
    });
    expect(msg).toContain("invalid_grant");
  });

  it("copes with no seed recorded at all", () => {
    expect(seedFailureMessage({ seedEmail: "" })).toMatch(/no seed inbox was recorded/i);
  });
});

/**
 * The platform-seed sentence then made the opposite mistake. It promised
 * unconditionally that a re-run would "measure against one of your own
 * connected mailboxes instead". That fallback is real, but only for an account
 * with a second readable Gmail — the sending mailbox cannot be its own seed,
 * because Gmail does not spam-filter mail an account sends to itself. With one
 * mailbox the re-run returns seed_not_configured, so the advice bounced the
 * reader between two messages, neither of which they could act on.
 */
describe("the promised fallback is one that exists", () => {
  it("names the mailbox a re-run would measure against", () => {
    const msg = seedFailureMessage({
      seedEmail: PLATFORM,
      platformAddress: PLATFORM,
      fallbackSeed: "second@bdotindustries.com",
    });
    expect(msg).toMatch(/run the test again/i);
    expect(msg).toContain("second@bdotindustries.com");
  });

  it("does not promise one when the account has none", () => {
    const msg = seedFailureMessage({ seedEmail: PLATFORM, platformAddress: PLATFORM });
    expect(msg).not.toMatch(/run the test again and it will measure/i);
    expect(msg).toMatch(/connect another gmail/i);
  });

  it("the collect step asks rather than assumes", () => {
    const branch = FN.slice(FN.indexOf("if (!seed.token)"), FN.indexOf("// Search the seed inbox"));
    expect(branch).toContain("fallbackSeed: await findFallbackSeed(");
  });

  it("the seed search excludes the mailbox doing the sending", () => {
    // A mailbox measuring its own placement reports "inbox" for every send
    // regardless of reputation, which is a worse answer than no answer.
    expect(FN).toContain("if (excludeIntegrationId && i.id === excludeIntegrationId) continue;");
  });
});

/**
 * A failed read is not automatically a dead test, and not automatically a live
 * one either. The distinction is whether the next attempt can produce a
 * different answer.
 */
describe("transient and permanent read failures are not the same thing", () => {
  it("a revoked or mismatched token is permanent", () => {
    expect(isPermanentSeedFailure("Google refused the token: invalid_grant")).toBe(true);
    expect(isPermanentSeedFailure("Google refused the token: unauthorized_client")).toBe(true);
    expect(isPermanentSeedFailure("Google OAuth credentials are not configured on the server")).toBe(true);
  });

  it("a server hiccup is not", () => {
    expect(isPermanentSeedFailure("Google refused the token (HTTP 500)")).toBe(false);
    expect(isPermanentSeedFailure(null)).toBe(false);
    expect(isPermanentSeedFailure("")).toBe(false);
  });

  it("only a permanent failure ends the test", () => {
    // Ending it on a hiccup threw away a recoverable test whose email is
    // sitting in the seed inbox either way. Never ending it parked the row on
    // `running` forever behind a "Check again" that could not succeed — one
    // such test sat unresolved on the timeline for ten days.
    expect(readFailureEndsTest("Google refused the token: invalid_grant")).toBe(true);
    expect(readFailureEndsTest("Google refused the token (HTTP 500)")).toBe(false);
  });

  it("the collect step honours it", () => {
    const branch = FN.slice(FN.indexOf("if (!seed.token)"), FN.indexOf("// Search the seed inbox"));
    expect(branch).toContain("readFailureEndsTest(seed.error)");
    expect(branch).toContain('status: "failed"');
  });

  it("still keeps the run going when the message has simply not arrived", () => {
    expect(FN).toContain('if (placement !== "missing")');
  });
});

/**
 * The reason a token exchange failed used to live in a module-level variable.
 * Edge functions reuse one isolate across concurrent invocations, so that
 * variable is shared by every request in flight: one account's failure could be
 * read out in another account's response, naming a mailbox and an error that
 * had nothing to do with them.
 */
describe("the real Google error survives to the surface, per request", () => {
  it("is carried on return values, not a shared variable", () => {
    expect(FN).not.toContain("lastTokenError");
    expect(FN).not.toMatch(/^let\s+\w+TokenError/m);
    expect(FN).toContain("Google refused the token");
  });

  it("names the missing-credentials case separately", () => {
    expect(FN).toContain("Google OAuth credentials are not configured on the server");
  });

  it("the message the user sees is built from this request's own reason", () => {
    const branch = FN.slice(FN.indexOf("if (!seed.token)"), FN.indexOf("// Search the seed inbox"));
    expect(branch).toContain("seedFailureMessage({");
    expect(branch).toContain("reason: seed.error");
  });
});

/**
 * The panel showed a test running with no indication of what it was measuring
 * against, so a seed failure read as the whole feature being broken rather than
 * one mailbox being unreadable. It also kept offering "Check again" after a
 * revoked token, which answers identically every time.
 */
describe("the panel says what it is measuring and stops offering what cannot work", () => {
  it("names the seed inbox", () => {
    expect(PANEL).toContain("Measuring against");
    expect(PANEL).toContain("res.seedEmail");
  });

  it("hides Check again once the seed is unreadable for good", () => {
    expect(PANEL).toContain("{testId && !terminal && (");
  });

  it("shows the function's own message instead of operator instructions", () => {
    // "Add the seed inbox credentials" is an instruction about a secret the
    // reader has no access to, and it was shown for every seed problem —
    // including ones they could have fixed by connecting a second mailbox.
    expect(PANEL).not.toContain("Add the seed inbox credentials");
    expect(PANEL).toContain("{errorMsg ||");
  });
});
