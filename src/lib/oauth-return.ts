/**
 * Telling the difference between "changed my mind" and "it broke".
 *
 * Google sign-in leaves this origin entirely: the SDK sets
 * window.location.href and the page is gone. Whatever happens next happens
 * inside Lovable's broker, and the only thing this app ever sees is the URL
 * the browser comes back with.
 *
 * When that URL carries tokens, Auth.tsx establishes the session. When it
 * carries `error`, Auth.tsx says so. When it carries NEITHER — which is what
 * a real failure looked like today: no tokens, no error, no code, just
 * /auth — the sign-in page renders again and the user is looking at exactly
 * what they would see if they had pressed cancel.
 *
 * That is the worst failure mode available: silent, indistinguishable from
 * the user's own choice, and invisible in any log. Diagnosing one instance of
 * it took three rounds of someone copying URLs out of an address bar.
 *
 * So the start of the attempt is recorded before leaving, and the return is
 * classified against it. A return with nothing, shortly after an attempt, is
 * reported as the failure it is.
 */

export const OAUTH_START_KEY = "outreign.oauth.startedAt";

/**
 * How long a return still counts as belonging to the attempt.
 *
 * Long enough for a slow consent screen and a password manager; short enough
 * that tomorrow's visit to /auth is not blamed on today's sign-in. The flag
 * is cleared on arrival either way, so this only bounds the case where the
 * user wandered off mid-flow and came back much later.
 */
export const OAUTH_WINDOW_MS = 10 * 60_000;

export type OAuthReturn =
  /** No attempt in flight — an ordinary visit to the sign-in page. */
  | { outcome: "not-returning" }
  /** The broker said what went wrong; Auth.tsx's own handler reports it. */
  | { outcome: "reported-error" }
  /** Credentials present; the session handler takes it from here. */
  | { outcome: "credentials" }
  /** Came back from an attempt carrying nothing at all. */
  | { outcome: "silent-failure"; carried: string; elapsedMs: number };

const params = (raw: string) =>
  new URLSearchParams(raw.startsWith("#") || raw.startsWith("?") ? raw.slice(1) : raw);

/**
 * What the browser came back with.
 *
 * Reads the hash as well as the query because the broker's redirect shape is
 * not documented anywhere this app can see, and a token in the half nobody
 * checked would be misreported as a failure — which would be worse than the
 * silence it is meant to replace.
 */
export function classifyOAuthReturn(args: {
  startedAt: number | null;
  now: number;
  search: string;
  hash: string;
}): OAuthReturn {
  const q = params(args.search);
  const h = params(args.hash);
  const has = (k: string) => !!(q.get(k) || h.get(k));

  if (has("error") || has("error_description")) return { outcome: "reported-error" };
  if ((has("access_token") && has("refresh_token")) || has("code")) return { outcome: "credentials" };

  if (args.startedAt == null) return { outcome: "not-returning" };
  const elapsedMs = args.now - args.startedAt;
  if (elapsedMs < 0 || elapsedMs > OAUTH_WINDOW_MS) return { outcome: "not-returning" };

  /*
   * Named, not dumped. The value of a token or a code must never reach a log
   * or a toast, so this reports which keys were present and nothing else —
   * enough to tell "came back empty" from "came back with something we failed
   * to read", which are different bugs with different owners.
   */
  const keys = [...new Set([...q.keys(), ...h.keys()])].filter((k) => k !== "__cr").sort();
  return {
    outcome: "silent-failure",
    carried: keys.length ? keys.join(", ") : "nothing",
    elapsedMs,
  };
}

/**
 * What the user is told. Accurate about who can fix it, and never blaming them.
 *
 * The fallback is worded for the person most likely to be reading it. Someone
 * whose only route in was Google has no password to fall back ON, so "use your
 * email and password" sends them to a second failure — the identical
 * frustration, one screen later. Forgot Password sets one against the same
 * address and the account is the same account either way.
 */
export function silentFailureMessage(carried: string): string {
  return (
    `Google sent you back without completing sign-in (the return carried ${carried}). ` +
    "This is on our side, not yours. If you have a password, sign in with your email " +
    "below. If you have only ever used Google, choose Forgot Password to set one — " +
    "it reaches the same account."
  );
}

/**
 * Forget an attempt that ended on this page.
 *
 * The flag is a claim that the browser is about to leave and come back. Every
 * outcome that does NOT leave — the popup path inside an iframe, an error from
 * the SDK, a thrown exception — has to retract it, or it outlives the attempt
 * and the next visit to /auth within the window reports a failure that already
 * finished. A false alarm on a sign-in page costs more trust than the silence
 * this was built to replace.
 */
export function clearOAuthStart(): void {
  try {
    sessionStorage.removeItem(OAUTH_START_KEY);
  } catch {
    // Blocked storage: nothing was written, so nothing needs removing.
  }
}

/**
 * What the broker's own error means, and whether trying again can help.
 *
 * `/auth` used to relay Google's `error_description` verbatim and append
 * "Please try again, or sign in with email". For one of these errors that
 * advice is actively wrong: the exchange happens between the broker and
 * Google's token endpoint using credentials neither the user nor the browser
 * touches, so if it fails once it fails every time until somebody changes the
 * configuration. Telling a user to retry sends them round a loop that cannot
 * terminate.
 *
 * It cost us more than that. `failed to exchange authorization code` reads
 * like something went wrong with the CODE — spent twice, expired, malformed —
 * and that is where the diagnosis went for hours. The authorization step had
 * in fact succeeded; a code existed and was fine. What did not match was the
 * client secret. The string names the step that failed and not the thing that
 * was wrong with it, so it points away from the cause.
 *
 * Classified rather than pattern-matched into prose, so the page can say
 * something true about whether to retry.
 */
export type BrokerFailure = "config" | "declined" | "unknown";

/** Errors that mean the credentials or the client registration, not the user. */
const CONFIG_ERRORS = [
  "failed to exchange authorization code",
  "invalid_client",
  "unauthorized_client",
  "invalid_grant",
  "redirect_uri_mismatch",
];

export function classifyBrokerError(error: string, description: string): BrokerFailure {
  const text = `${error} ${description}`.toLowerCase().replace(/\+/g, " ");
  // The user closed the consent screen. Theirs to repeat, and it may well work.
  if (text.includes("access_denied")) return "declined";
  if (CONFIG_ERRORS.some((e) => text.includes(e))) return "config";
  return "unknown";
}

/**
 * The message for a broker error.
 *
 * `raw` is kept in all three branches: it is the only thing that distinguishes
 * one configuration failure from another, and a user reporting it is often how
 * anyone finds out at all.
 */
export function brokerErrorMessage(error: string, description: string): string {
  const raw = (description || error).replace(/\+/g, " ").replace(/\.\s*$/, "");
  switch (classifyBrokerError(error, description)) {
    case "declined":
      return "You left the Google consent screen before finishing. Choose Continue with Google again, or sign in with your email below.";
    case "config":
      /*
       * No "try again" here, deliberately. Same reasoning as
       * silentFailureMessage: a Google-only account has no password to fall
       * back on, so Forgot Password against the same address is the route in.
       */
      return (
        `Google sign-in is misconfigured on our side, so it will keep failing until we fix it (${raw}). ` +
        "Nothing is wrong with your account. Sign in with your email below, or choose " +
        "Forgot Password to set one — it reaches the same account."
      );
    default:
      return `Google sign-in didn't finish (${raw}). Sign in with your email below, or choose Forgot Password to set one — it reaches the same account.`;
  }
}
