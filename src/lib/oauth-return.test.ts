import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  OAUTH_START_KEY,
  OAUTH_WINDOW_MS,
  brokerErrorMessage,
  classifyBrokerError,
  classifyOAuthReturn,
  clearOAuthStart,
  silentFailureMessage,
} from "./oauth-return";

/**
 * Google sign-in came back with nothing, and the app said nothing.
 *
 * Three rounds of diagnosis went into one instance of this, all of it
 * someone copying URLs out of an address bar, because the only trace the
 * failure left was a sign-in page that looked exactly like the one a user
 * sees after pressing cancel.
 *
 * The real return, from the report: no tokens, no error, no code. The token
 * handler correctly did nothing and the error handler correctly did nothing,
 * so between them they reported a failure as a non-event.
 */

const NOW = 1_792_098_270_000;
const ret = (over: Partial<Parameters<typeof classifyOAuthReturn>[0]> = {}) =>
  classifyOAuthReturn({ startedAt: NOW - 20_000, now: NOW, search: "", hash: "", ...over });

describe("a return that carries nothing", () => {
  it("is a failure, not a non-event", () => {
    const v = ret();
    expect(v.outcome).toBe("silent-failure");
    if (v.outcome === "silent-failure") expect(v.carried).toBe("nothing");
  });

  it("names what did come back, so an empty return and an unread one differ", () => {
    // Different bugs with different owners: nothing arrived, versus
    // something arrived that this app failed to read.
    const v = ret({ search: "?session_id=abc&foo=1" });
    if (v.outcome === "silent-failure") expect(v.carried).toBe("foo, session_id");
    else throw new Error(`expected silent-failure, got ${v.outcome}`);
  });

  /*
   * __cr is this app's own stale-chunk cache-buster, added by
   * recoverFromStaleChunk. It appeared on the reported URL and cost real time
   * to rule out; it says nothing about the sign-in and is not worth repeating
   * back to anyone.
   */
  it("ignores our own cache-buster", () => {
    const v = ret({ search: "?__cr=1792098270235" });
    if (v.outcome === "silent-failure") expect(v.carried).toBe("nothing");
    else throw new Error(`expected silent-failure, got ${v.outcome}`);
  });

  it("never repeats a credential back", () => {
    // Keys only. A token or a code in a toast or a log is a token or a code
    // in somewhere it should not be.
    const v = ret({ search: "?weird_token=supersecret" });
    if (v.outcome === "silent-failure") {
      expect(v.carried).toBe("weird_token");
      expect(JSON.stringify(v)).not.toContain("supersecret");
    }
  });
});

describe("what it leaves alone", () => {
  it("defers when the broker named the error", () => {
    expect(ret({ search: "?error=server_error&error_description=failed" }).outcome).toBe("reported-error");
    expect(ret({ hash: "#error=access_denied" }).outcome).toBe("reported-error");
  });

  it("defers when credentials are present, in either half of the URL", () => {
    expect(ret({ hash: "#access_token=a&refresh_token=b" }).outcome).toBe("credentials");
    expect(ret({ search: "?access_token=a&refresh_token=b" }).outcome).toBe("credentials");
    expect(ret({ search: "?code=abc" }).outcome).toBe("credentials");
  });

  it("says nothing on an ordinary visit to the sign-in page", () => {
    expect(ret({ startedAt: null }).outcome).toBe("not-returning");
  });

  it("says nothing about an attempt from much earlier", () => {
    expect(ret({ startedAt: NOW - OAUTH_WINDOW_MS - 1 }).outcome).toBe("not-returning");
    expect(ret({ startedAt: NOW + 5_000 }).outcome).toBe("not-returning");
  });

  it("allows a slow consent screen", () => {
    expect(ret({ startedAt: NOW - (OAUTH_WINDOW_MS - 1_000) }).outcome).toBe("silent-failure");
  });
});

describe("what the user is told", () => {
  it("says who can fix it, and does not blame them", () => {
    const m = silentFailureMessage("nothing");
    expect(m).toContain("on our side");
  });

  /*
   * The person most likely to be reading this signed up with Google and has
   * no password to fall back on. "Use your email and password" sends them to
   * a second failure — the identical frustration, one screen later.
   */
  it("does not send a Google-only user at a password they never set", () => {
    const m = silentFailureMessage("nothing");
    expect(m).toContain("Forgot Password");
    expect(m).not.toMatch(/sign in with your email and password for now/i);
  });

  it("points at a control the sign-in page actually has", () => {
    expect(readFileSync("src/components/auth/AuthForm.tsx", "utf8")).toContain("Forgot Password?");
  });
});

/**
 * The flag claims the browser is about to leave and come back.
 *
 * Every outcome that does not leave has to retract it. The popup path inside
 * an iframe, an error from the SDK and a thrown exception all finish on this
 * page, and a flag left set there makes the next visit to /auth report a
 * failure that already finished — a false alarm on a sign-in page, which
 * costs more trust than the silence this replaced.
 */
describe("an attempt that ends on this page is forgotten", () => {
  const FORM = readFileSync("src/components/auth/AuthForm.tsx", "utf8");
  const handler = FORM.slice(FORM.indexOf("const handleGoogleAuth"), FORM.indexOf("const handleSubmit"));

  it("keeps the flag only when the page is leaving", () => {
    const redirected = handler.indexOf("if (result.redirected) return;");
    const clear = handler.indexOf("clearOAuthStart();");
    expect(redirected).toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(redirected);
  });

  it("clears it before reporting an SDK error", () => {
    const clear = handler.indexOf("clearOAuthStart();");
    expect(handler.indexOf("if (result.error) {")).toBeGreaterThan(clear);
  });

  it("clears it on a throw too", () => {
    const tail = handler.slice(handler.indexOf("} catch (err"));
    expect(tail).toContain("clearOAuthStart();");
  });

  it("uses the shared helper, not a second spelling of removeItem", () => {
    expect(FORM).not.toContain("sessionStorage.removeItem");
  });
});

describe("both ends are wired", () => {
  const FORM = readFileSync("src/components/auth/AuthForm.tsx", "utf8");
  const PAGE = readFileSync("src/pages/Auth.tsx", "utf8");

  it("the attempt is recorded before the page is gone", () => {
    // signInWithOAuth sets window.location.href; nothing in memory survives.
    const handler = FORM.slice(FORM.indexOf("const handleGoogleAuth"));
    const mark = handler.indexOf(`sessionStorage.setItem(OAUTH_START_KEY`);
    const leave = handler.indexOf("lovable.auth.signInWithOAuth");
    expect(mark).toBeGreaterThan(-1);
    expect(mark).toBeLessThan(leave);
  });

  it("blocked storage does not break signing in", () => {
    /*
     * Private mode loses the diagnosis, not the feature.
     *
     * Sliced to the qualified call, not the bare name: the comment above it
     * says "signInWithOAuth", so slicing on that ended the region before the
     * code it was meant to cover and the assertion failed against a correct
     * implementation.
     */
    const handler = FORM.slice(FORM.indexOf("const handleGoogleAuth"));
    const upToCall = handler.slice(0, handler.indexOf("lovable.auth.signInWithOAuth"));
    expect(upToCall).toContain("sessionStorage.setItem(OAUTH_START_KEY");
    expect(upToCall).toContain("} catch {");
  });

  it("the return is classified, and the flag cleared either way", () => {
    expect(PAGE).toContain("classifyOAuthReturn({");
    expect(PAGE).toContain(`sessionStorage.removeItem(OAUTH_START_KEY)`);
  });

  it("the key is one constant, not two spellings", () => {
    expect(OAUTH_START_KEY).toBe("outreign.oauth.startedAt");
    expect(FORM).toContain("OAUTH_START_KEY");
    expect(PAGE).toContain("OAUTH_START_KEY");
    expect(FORM).not.toContain('"outreign.oauth.startedAt"');
  });
});

describe("what the broker's error means, and whether retrying can help", () => {
  /*
   * The string that actually came back from the live flow, hours of it.
   *
   * `/auth` relayed it verbatim and added "Please try again, or sign in with
   * email". The exchange runs between the broker and Google's token endpoint
   * using a client secret that neither the user nor the browser ever touches,
   * so the one thing a retry cannot change is the thing that was wrong.
   */
  const LIVE = "failed to exchange authorization code";

  it("the live failure is a configuration failure, not a retryable one", () => {
    expect(classifyBrokerError("server_error", LIVE)).toBe("config");
    const msg = brokerErrorMessage("server_error", LIVE);
    // Must not send them round a loop that cannot terminate.
    expect(msg.toLowerCase()).not.toContain("try again");
    // Must say whose problem it is, and that it persists.
    expect(msg).toMatch(/misconfigured|our side/i);
    expect(msg).toContain("Nothing is wrong with your account");
    // And keep the raw string: it is what distinguishes one config failure
    // from another, and a user quoting it is often how anyone finds out.
    expect(msg).toContain(LIVE);
  });

  it("the URL-encoded form is classified the same", () => {
    // It arrives as a query parameter, so this is the spelling that shows up.
    expect(classifyBrokerError("server_error", "failed+to+exchange+authorization+code")).toBe("config");
    expect(brokerErrorMessage("server_error", "failed+to+exchange+authorization+code")).not.toContain("+");
  });

  it("the other credential errors are the same kind of problem", () => {
    for (const e of ["invalid_client", "unauthorized_client", "invalid_grant", "redirect_uri_mismatch"]) {
      expect(classifyBrokerError(e, ""), e).toBe("config");
      expect(brokerErrorMessage(e, "").toLowerCase(), e).not.toContain("try again");
    }
  });

  it("a user who closed the consent screen IS told to try again", () => {
    /*
     * The one branch where retrying is the right advice, and the reason this
     * is classified rather than blanket-worded: telling someone who changed
     * their mind that the product is broken is its own wrong answer.
     */
    expect(classifyBrokerError("access_denied", "The user denied the request")).toBe("declined");
    const msg = brokerErrorMessage("access_denied", "The user denied the request");
    expect(msg).toContain("again");
    expect(msg).not.toMatch(/misconfigured/i);
  });

  it("an unrecognised error neither promises a retry nor blames the config", () => {
    expect(classifyBrokerError("something_new", "who knows")).toBe("unknown");
    const msg = brokerErrorMessage("something_new", "who knows");
    expect(msg).toContain("who knows");
    expect(msg).not.toMatch(/misconfigured/i);
    expect(msg.toLowerCase()).not.toContain("try again");
  });

  it("every branch offers a route in that a Google-only account has", () => {
    /*
     * Same trap silentFailureMessage was written around: someone whose only
     * route in was Google has no password, so "sign in with email" alone sends
     * them to a second failure one screen later.
     */
    for (const [e, d] of [["server_error", LIVE], ["access_denied", "denied"], ["odd", "odd"]]) {
      expect(brokerErrorMessage(e, d), `${e} offers no way in`).toMatch(/email/i);
    }
    // The two that are not the user's own choice name the password route.
    expect(brokerErrorMessage("server_error", LIVE)).toContain("Forgot Password");
    expect(brokerErrorMessage("odd", "odd")).toContain("Forgot Password");
  });

  it("the page uses the classifier rather than relaying the raw string", () => {
    const page = readFileSync("src/pages/Auth.tsx", "utf8");
    expect(page).toContain("brokerErrorMessage(err, desc)");
    // The old form is what told users to retry a permanent failure.
    expect(page).not.toContain("Please try again, or sign in with email.");
  });
});
