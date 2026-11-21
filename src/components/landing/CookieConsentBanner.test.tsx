/** @vitest-environment jsdom */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
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

describe("cookie consent banner", () => {
  afterEach(() => {
    localStorage.clear();
    installSdk(null);
  });

  it("accept sets consent and calls the SDK", async () => {
    let consented = false;
    installSdk({
      consent() {
        consented = true;
      },
    });
    const view = await renderAt("/");
    expect(view.host.textContent).toContain("We use cookies to understand which companies visit our site.");
    expect(view.host.querySelector('a[href="/privacy"]')).toBeTruthy();
    await act(async () => {
      buttonNamed(view.host, "Accept")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(localStorage.getItem("outreigh_consent")).toBe("1");
    expect(localStorage.getItem("outreigh_cookie_choice")).toBe("accept");
    expect(consented).toBe(true);
    expect(view.host.textContent).not.toContain("We use cookies");
    await view.unmount();
  });

  it("decline calls disable and stays dismissed", async () => {
    let disabled = false;
    installSdk({
      disable() {
        disabled = true;
      },
    });
    const view = await renderAt("/pricing");
    await act(async () => {
      buttonNamed(view.host, "Decline")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(disabled).toBe(true);
    expect(localStorage.getItem("outreigh_cookie_choice")).toBe("decline");
    expect(localStorage.getItem("outreigh_off")).toBe("1");
    expect(view.host.textContent).not.toContain("We use cookies");
    await view.unmount();

    const again = await renderAt("/pricing");
    expect(again.host.textContent).not.toContain("We use cookies");
    await again.unmount();
  });

  it("stays hidden on app routes and when a choice is already stored", async () => {
    const app = await renderAt("/dashboard/visitors");
    expect(app.host.textContent).not.toContain("We use cookies");
    await app.unmount();

    localStorage.setItem("outreigh_cookie_choice", "accept");
    const remembered = await renderAt("/");
    expect(remembered.host.textContent).not.toContain("We use cookies");
    await remembered.unmount();
  });
});
