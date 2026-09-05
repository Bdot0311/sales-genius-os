/**
 * What to tell someone whose placement test could not be read.
 *
 * The test sends a tagged email to a seed inbox and then reads that inbox to
 * see which folder it landed in. When the read fails the user was told:
 *
 *   "The test email was sent, but outreign.seed@gmail.com could not be read to
 *    see where it landed. Reconnect that mailbox and run the test again."
 *
 * outreign.seed@gmail.com is the PLATFORM seed. It lives in an operator secret
 * (DELIVERABILITY_SEED_GMAIL_REFRESH) and appears nowhere in the customer's
 * integrations. There is no button anywhere in the product that reconnects it.
 * The user was handed an instruction they could not carry out, about a mailbox
 * they do not own, and the actual Google error went to a server log they cannot
 * read.
 *
 * The two cases need different sentences because they have different owners.
 * A seed that is one of the user's own mailboxes is theirs to reconnect. The
 * platform seed is ours, and the only thing they can do is run the test again —
 * which is genuinely useful, because the send path falls back to one of their
 * own connected mailboxes when the platform seed is unreadable.
 */

export interface SeedFailure {
  /** The address the test was sent to. */
  seedEmail: string;
  /** The configured platform seed address, when there is one. */
  platformAddress?: string | null;
  /** Whatever the token exchange actually said, when we have it. */
  reason?: string | null;
}

/** True when the seed is the shared platform inbox rather than the user's own. */
export function isPlatformSeed(seedEmail: string, platformAddress?: string | null): boolean {
  const seed = String(seedEmail ?? "").trim().toLowerCase();
  const platform = String(platformAddress ?? "").trim().toLowerCase();
  return Boolean(seed && platform && seed === platform);
}

/**
 * The message shown when the seed inbox cannot be read.
 *
 * Never says "reconnect that mailbox" about the platform seed, because that is
 * not a thing the reader can do.
 */
export function seedFailureMessage(f: SeedFailure): string {
  const seed = String(f.seedEmail ?? "").trim();
  const reason = String(f.reason ?? "").trim();
  const because = reason ? ` (${reason})` : "";

  if (isPlatformSeed(seed, f.platformAddress)) {
    return (
      `The test email was sent and has landed, but our shared seed inbox could not be read` +
      `${because}, so we cannot tell you which folder it went to. This one is on us rather ` +
      `than on your setup — nothing in your account is misconfigured. Run the test again and ` +
      `it will measure against one of your own connected mailboxes instead.`
    );
  }

  if (!seed) {
    return (
      `The test email was sent, but no seed inbox was recorded for it, so there is nothing to ` +
      `read the result from. Run the test again.`
    );
  }

  return (
    `The test email was sent, but ${seed} could not be read to see where it landed${because}. ` +
    `That mailbox is connected to your account, so reconnecting it on the Integrations page and ` +
    `running the test again will fix this.`
  );
}

/**
 * Whether a failed read should end the test.
 *
 * It should not. The email is sitting in the seed inbox either way, so the
 * result is still there to be collected — the same reasoning the collect step
 * already applies when a message has not arrived yet ("keep the test running so
 * a later collect can find it"), which it then failed to apply to a token
 * hiccup. Marking the row `failed` threw away a recoverable test and made
 * "Check again" look broken, because the thing it was checking had been
 * declared dead one transient error earlier.
 */
export const READ_FAILURE_ENDS_TEST = false;
