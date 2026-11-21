import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acceptVisitorCookies,
  declineVisitorCookies,
  hasBrowserPrivacySignal,
  isAppRoute,
  readCookieChoice,
  shouldShowCookieBanner,
  type ConsentStorage,
  type VisitorSdk,
} from "./cookie-consent";

function memory(initial: Record<string, string> = {}): ConsentStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

function show(pathname: string, storage: ConsentStorage, privacySignal = false) {
  return shouldShowCookieBanner({
    pathname,
    choice: readCookieChoice(storage),
    privacySignal,
  });
}

describe("cookie consent banner", () => {
  it("keeps the required-consent collector on the public document", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain(
      'src="https://outreign.io/v.js" data-site-id="0879ff2d-7e87-4070-9259-495b7a71b9db" data-consent="required"',
    );
  });

  it("accept sets consent before calling the SDK, which records the current pageview", () => {
    const storage = memory();
    let consentAtCall: string | null = "missing";
    const sdk: VisitorSdk = {
      consent() {
        consentAtCall = storage.getItem("outreigh_consent");
      },
    };

    acceptVisitorCookies({ storage, sdk });

    expect(consentAtCall).toBe("1");
    expect(storage.getItem("outreigh_consent")).toBe("1");
    expect(storage.getItem("outreigh_cookie_choice")).toBe("accept");
    expect(show("/", storage)).toBe(false);
  });

  it("accept still stores consent when v.js has not loaded", () => {
    const storage = memory();
    expect(() => acceptVisitorCookies({ storage, sdk: null })).not.toThrow();
    expect(storage.getItem("outreigh_consent")).toBe("1");
    expect(readCookieChoice(storage)).toBe("accept");
  });

  it("accept still calls the SDK when storage is blocked", () => {
    let called = false;
    const storage: ConsentStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
    };
    expect(() => acceptVisitorCookies({
      storage,
      sdk: {
        consent() {
          called = true;
        },
      },
    })).not.toThrow();
    expect(called).toBe(true);
  });

  it("decline calls disable and remembers the choice", () => {
    const storage = memory();
    let disabled = false;
    declineVisitorCookies({
      storage,
      sdk: {
        disable() {
          disabled = true;
        },
      },
    });

    expect(disabled).toBe(true);
    expect(storage.getItem("outreigh_off")).toBe("1");
    expect(storage.getItem("outreigh_cookie_choice")).toBe("decline");
    expect(storage.getItem("outreigh_consent")).toBeNull();
    expect(show("/pricing", storage)).toBe(false);
  });

  it("decline still remembers the choice when disable is missing", () => {
    const storage = memory();
    expect(() => declineVisitorCookies({ storage })).not.toThrow();
    expect(storage.getItem("outreigh_cookie_choice")).toBe("decline");
    expect(storage.getItem("outreigh_off")).toBe("1");
    expect(show("/", storage)).toBe(false);
  });

  it("hides on app routes and shows on marketing pages", () => {
    const storage = memory();
    for (const path of ["/", "/pricing", "/privacy", "/blog/email-warmup", "/vs-apollo", "/connect"]) {
      expect(show(path, storage), path).toBe(true);
    }
    for (const path of [
      "/dashboard",
      "/dashboard/visitors",
      "/auth",
      "/settings",
      "/admin/users",
      "/onboarding",
      "/onboarding-status",
      "/checkout",
      "/integrations",
      "/client-portal/abc",
      "/appsumo",
      "/.lovable/oauth/consent",
    ]) {
      expect(show(path, storage), path).toBe(false);
      expect(isAppRoute(path), path).toBe(true);
    }
    expect(isAppRoute("/dashboards")).toBe(false);
    expect(show("/dashboards", storage)).toBe(true);
  });

  it("stays hidden when the choice was already stored", () => {
    expect(show("/", memory({ outreigh_cookie_choice: "accept" }))).toBe(false);
    expect(show("/", memory({ outreigh_consent: "1" }))).toBe(false);
    expect(show("/blog", memory({ outreigh_off: "1" }))).toBe(false);
  });

  it("stays hidden when the browser asks not to be tracked", () => {
    const storage = memory();
    expect(hasBrowserPrivacySignal({ doNotTrack: "1" })).toBe(true);
    expect(hasBrowserPrivacySignal({ globalPrivacyControl: true })).toBe(true);
    expect(hasBrowserPrivacySignal({ doNotTrack: "0", globalPrivacyControl: false })).toBe(false);
    expect(show("/", storage, true)).toBe(false);
    expect(show("/", storage, false)).toBe(true);
  });
});
