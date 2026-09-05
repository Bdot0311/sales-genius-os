import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  READ_FAILURE_ENDS_TEST,
  isPlatformSeed,
  seedFailureMessage,
} from "../../supabase/functions/_shared/placement-seed";

const FN = readFileSync("supabase/functions/run-placement-test/index.ts", "utf8");
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

  it("gives the platform case something that actually works", () => {
    // Running the test again is real advice: the send path falls back to one
    // of the user's own connected mailboxes when the platform seed is dead.
    const msg = seedFailureMessage({ seedEmail: PLATFORM, platformAddress: PLATFORM });
    expect(msg).toMatch(/run the test again/i);
    expect(msg).toMatch(/one of your own connected mailboxes/i);
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
 * The collect step marked the row `failed` the moment a read failed — throwing
 * away a test whose email is still sitting in the seed inbox, and making
 * "Check again" look broken because the thing it re-checked had been declared
 * dead one transient error earlier. The same file already reasons correctly
 * about this for a message that has not arrived yet.
 */
describe("a failed read does not destroy a recoverable test", () => {
  it("is stated as a rule rather than buried in a branch", () => {
    expect(READ_FAILURE_ENDS_TEST).toBe(false);
  });

  it("the collect step honours it", () => {
    const branch = FN.slice(FN.indexOf("if (!seedToken)"), FN.indexOf("// Search the seed inbox"));
    expect(branch).toContain("if (READ_FAILURE_ENDS_TEST)");
  });

  it("still keeps the run going when the message has simply not arrived", () => {
    expect(FN).toContain('if (placement !== "missing")');
  });
});

describe("the real Google error survives to the surface", () => {
  it("the token exchange records why it failed", () => {
    expect(FN).toContain("lastTokenError");
    expect(FN).toContain("Google refused the token");
  });

  it("names the missing-credentials case separately", () => {
    expect(FN).toContain("Google OAuth credentials are not configured on the server");
  });

  it("the message the user sees is built from it", () => {
    // Windowed to the branch, not to a byte count: the comment explaining why
    // a read failure is recoverable sits between the guard and the message.
    const branch = FN.slice(FN.indexOf("if (!seedToken)"), FN.indexOf("// Search the seed inbox"));
    expect(branch).toContain("seedFailureMessage({");
    expect(branch).toContain("reason: lastTokenError");
  });

  it("clears the reason on success, so a later failure cannot inherit it", () => {
    expect(FN).toContain("lastTokenError = null;");
  });
});
