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

/** What the user is told. Accurate about who can fix it, and never blaming them. */
export function silentFailureMessage(carried: string): string {
  return (
    `Google sent you back without completing sign-in (the return carried ${carried}). ` +
    "This is on our side, not yours. Sign in with your email and password for now — " +
    "that works, and it gets you to the same account."
  );
}
