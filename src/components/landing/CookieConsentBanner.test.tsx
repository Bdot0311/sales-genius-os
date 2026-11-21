/** @vitest-environment jsdom */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CookieConsentBanner } from "./CookieConsentBanner";

type Sdk = { consent?: () => void; disable?: () => void };

function installSdk(sdk: Sdk | null) {
  const root = window as Window & { OutReign?: Sdk };
  if (sdk) root.OutReign = sdk;
  else delete root.OutReign;
}

async function renderAt(path: string) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(
      MemoryRouter,
      { initialEntries: [path], future: { v7_startTransition: true, v7_relativeSplatPath: true } },
      createElement(CookieConsentBanner),
    ));
  });
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function buttonNamed(host: HTMLElement, name: string) {
  return Array.from(host.querySelectorAll("button")).find((button) => button.textContent === name);
}

async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

describe("cookie consent banner", () => {
  beforeEach(() => {
    // No location answer means the visitor is treated as being in a consent region.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  });
  afterEach(() => {
    localStorage.clear();
    installSdk(null);
    vi.unstubAllGlobals();
  });

  it("Reject all denies analytics and advertising and turns the visitor collector off", async () => {
    let disabled = false;
    installSdk({ disable() { disabled = true; } });
    const view = await renderAt("/");
    await flush();
    await act(async () => { buttonNamed(view.host, "Reject all")!.click(); });
    expect(JSON.parse(localStorage.getItem("cookie_consent_analytics")!).choice).toBe("denied");
    expect(JSON.parse(localStorage.getItem("cookie_consent_advertising")!).choice).toBe("denied");
    expect(localStorage.getItem("outreigh_off")).toBe("1");
    expect(disabled).toBe(true);
    expect(buttonNamed(view.host, "Reject all")).toBeUndefined();
    await view.unmount();
  });

  it("Accept all grants both purposes and consents the visitor collector", async () => {
    let consented = false;
    installSdk({ consent() { consented = true; } });
    const view = await renderAt("/");
    await flush();
    await act(async () => { buttonNamed(view.host, "Accept all")!.click(); });
    expect(JSON.parse(localStorage.getItem("cookie_consent_analytics")!).choice).toBe("granted");
    expect(JSON.parse(localStorage.getItem("cookie_consent_advertising")!).choice).toBe("granted");
    expect(localStorage.getItem("outreigh_consent")).toBe("1");
    expect(consented).toBe(true);
    await view.unmount();
  });

  it("never shows on signed-in app pages", async () => {
    const view = await renderAt("/dashboard");
    await flush();
    expect(buttonNamed(view.host, "Accept all")).toBeUndefined();
    await view.unmount();
  });
});
