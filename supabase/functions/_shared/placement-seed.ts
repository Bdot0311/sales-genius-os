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
 * platform seed is ours.
 *
 * The platform-seed sentence then made the opposite mistake: it promised
 * unconditionally that running the test again would "measure against one of
 * your own connected mailboxes instead". That fallback is real, but only for an
 * account with a second readable Gmail. With one connected mailbox the re-run
 * returns seed_not_configured, which the panel renders as operator language
 * about adding seed credentials — so the advice bounced the reader between two
 * messages, neither of which they could act on. Whether a fallback exists is
 * knowable before the sentence is written, so it is now passed in and the
 * sentence says the true thing either way.
 */

export interface SeedFailure {
  /** The address the test was sent to. */
  seedEmail: string;
  /** The configured platform seed address, when there is one. */
  platformAddress?: string | null;
  /** Whatever the token exchange actually said, when we have it. */
  reason?: string | null;
  /**
   * One of the user's own readable Gmail mailboxes that a re-run could measure
   * against, when they have one. Null or absent means they do not, and the
   * message must not promise a fallback that cannot happen.
   */
  fallbackSeed?: string | null;
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
 * not a thing the reader can do, and never promises a fallback measurement
 * without one to fall back to.
 */
export function seedFailureMessage(f: SeedFailure): string {
  const seed = String(f.seedEmail ?? "").trim();
  const reason = String(f.reason ?? "").trim();
  const because = reason ? ` (${reason})` : "";
  const fallback = String(f.fallbackSeed ?? "").trim();

  if (isPlatformSeed(seed, f.platformAddress)) {
    const head =
      `The test email was sent and has landed, but our shared seed inbox could not be read` +
      `${because}, so we cannot tell you which folder it went to. This one is on us rather ` +
      `than on your setup — nothing in your account is misconfigured.`;

    return fallback
      ? `${head} Run the test again and it will measure against ${fallback} instead.`
      : `${head} Measuring placement needs a second inbox we can read, and a mailbox cannot ` +
        `measure its own, so there is nothing to fall back to on this account. Connect another ` +
        `Gmail on the Integrations page and run the test again, or wait for us to restore the ` +
        `shared inbox.`;
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
 * Whether the reason a token exchange failed will still be true on the next try.
 *
 * Google distinguishes these clearly and the distinction is the whole question.
 * invalid_grant means the refresh token is revoked or expired: no amount of
 * re-checking produces a different answer until somebody re-authorises the
 * mailbox. An HTTP 500 or a network blip is the opposite — the next call may
 * well work.
 */
export function isPermanentSeedFailure(reason?: string | null): boolean {
  return /invalid_grant|unauthorized_client|invalid_client|credentials are not configured/i.test(
    String(reason ?? ""),
  );
}

/**
 * Whether a failed read should end the test.
 *
 * It used to end it unconditionally, which threw away a recoverable test: the
 * email is sitting in the seed inbox either way, so the result is still there
 * to be collected — the same reasoning the collect step already applies when a
 * message has not arrived yet. Marking the row `failed` on a transient error
 * made "Check again" look broken, because the thing it was checking had been
 * declared dead one hiccup earlier.
 *
 * The correction then overshot to never. A revoked refresh token is not a
 * hiccup: every later check returns the identical error, the row stays
 * `running` forever and the timeline carries a "did not complete" entry that
 * will never resolve itself. That is the state this replaced — one such test
 * sat unresolved for ten days.
 *
 * So: transient failures leave the test alive to be collected later, permanent
 * ones end it, because there is nothing left to wait for.
 */
export function readFailureEndsTest(reason?: string | null): boolean {
  return isPermanentSeedFailure(reason);
}
