import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  OAUTH_START_KEY,
  OAUTH_WINDOW_MS,
  classifyOAuthReturn,
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
    expect(m).toContain("email and password");
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
