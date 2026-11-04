import { describe, it, expect, beforeEach } from "vitest";
import {
  GIS_SCRIPT_SRC,
  GOOGLE_CLIENT_ID,
  loadGoogleIdentity,
  looksLikeGoogleClientId,
  resetGoogleIdentityLoader,
} from "./google-identity";

/**
 * A window with just enough document for the loader, driven by the test.
 *
 * The real thing is not available here (vitest runs in node), and injecting
 * it is what lets the failure paths — a blocked script, a slow one — be
 * exercised at all. They are the paths that matter: each one must leave the
 * caller with its own sign-in button rather than an exception.
 */
function fakeWindow(options: { existingScript?: boolean } = {}) {
  const handlers: Record<string, Array<() => void>> = {};
  const script = {
    src: "",
    async: false,
    defer: false,
    addEventListener(event: string, fn: () => void) {
      (handlers[event] ||= []).push(fn);
    },
  };
  const appended: unknown[] = [];
  const win: any = {
    document: {
      querySelector: (selector: string) =>
        options.existingScript && selector.includes(GIS_SCRIPT_SRC) ? script : null,
      createElement: () => script,
      head: { appendChild: (el: unknown) => appended.push(el) },
    },
  };
  return {
    win,
    script,
    appended,
    fire(event: string) {
      (handlers[event] ?? []).forEach((fn) => fn());
    },
  };
}

beforeEach(() => {
  resetGoogleIdentityLoader();
});

describe("looksLikeGoogleClientId", () => {
  it("accepts the id this deployment ships with", () => {
    expect(looksLikeGoogleClientId(GOOGLE_CLIENT_ID)).toBe(true);
  });

  /*
   * The id can be overridden by an environment variable, and a half-pasted
   * override reaches Google's initialize() as a console error and a button
   * that silently does nothing. Rejecting it here keeps the old button.
   */
  it("rejects empty, partial and unrelated values", () => {
    expect(looksLikeGoogleClientId("")).toBe(false);
    expect(looksLikeGoogleClientId(undefined)).toBe(false);
    expect(looksLikeGoogleClientId(null)).toBe(false);
    expect(looksLikeGoogleClientId("1077235865225-cheefmhijcepqc454s401n12ch8i2khh")).toBe(false);
    expect(looksLikeGoogleClientId("apps.googleusercontent.com")).toBe(false);
    expect(looksLikeGoogleClientId("not a client id")).toBe(false);
  });
});

describe("loadGoogleIdentity", () => {
  it("resolves the api once Google's script has loaded", async () => {
    const env = fakeWindow();
    const api = { initialize() {}, renderButton() {} };
    const pending = loadGoogleIdentity({ win: env.win });

    env.win.google = { accounts: { id: api } };
    env.fire("load");

    expect(await pending).toBe(api);
    expect(env.script.src).toBe(GIS_SCRIPT_SRC);
    expect(env.appended).toHaveLength(1);
  });

  it("resolves null when the script is blocked", async () => {
    const env = fakeWindow();
    const pending = loadGoogleIdentity({ win: env.win });
    env.fire("error");
    expect(await pending).toBeNull();
  });

  it("resolves null when the script never finishes loading", async () => {
    const env = fakeWindow();
    expect(await loadGoogleIdentity({ win: env.win, timeoutMs: 5 })).toBeNull();
  });

  /*
   * A load that fires after the timeout must not resolve a promise that has
   * already answered null, and must not throw either.
   */
  it("stays settled when a timed-out script loads afterwards", async () => {
    const env = fakeWindow();
    const pending = loadGoogleIdentity({ win: env.win, timeoutMs: 5 });
    expect(await pending).toBeNull();

    env.win.google = { accounts: { id: { initialize() {}, renderButton() {} } } };
    expect(() => env.fire("load")).not.toThrow();
    expect(await pending).toBeNull();
  });

  it("returns the api without touching the document when it is already there", async () => {
    const env = fakeWindow();
    const api = { initialize() {}, renderButton() {} };
    env.win.google = { accounts: { id: api } };

    expect(await loadGoogleIdentity({ win: env.win })).toBe(api);
    expect(env.appended).toHaveLength(0);
  });

  /*
   * The sign-in form can mount more than once in a session. Appending
   * Google's script again each time would load it repeatedly and re-register
   * its global.
   */
  it("reuses a script tag that is already in the page", async () => {
    const env = fakeWindow({ existingScript: true });
    const pending = loadGoogleIdentity({ win: env.win });

    env.win.google = { accounts: { id: { initialize() {}, renderButton() {} } } };
    env.fire("load");

    await pending;
    expect(env.appended).toHaveLength(0);
  });

  it("resolves null rather than throwing when there is no document", async () => {
    expect(await loadGoogleIdentity({ win: {} as any })).toBeNull();
  });
});
