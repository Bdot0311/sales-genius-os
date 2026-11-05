import { describe, it, expect, beforeEach } from "vitest";
import {
  CALENDLY_SCRIPT_SRC,
  CALENDLY_STYLE_HREF,
  loadCalendly,
  resetCalendlyLoader,
} from "./calendly-embed";

/** A window with just enough document for the loader, driven by the test. */
function fakeWindow(options: { existingScript?: boolean } = {}) {
  const handlers: Record<string, Array<() => void>> = {};
  const script: any = {
    src: "",
    addEventListener(event: string, fn: () => void) {
      (handlers[event] ||= []).push(fn);
    },
  };
  const appended: any[] = [];
  const win: any = {
    document: {
      querySelector: (selector: string) =>
        options.existingScript && selector.includes(CALENDLY_SCRIPT_SRC) ? script : null,
      createElement: (tag: string) => (tag === "script" ? script : { rel: "", href: "" }),
      head: { appendChild: (el: unknown) => appended.push(el) },
    },
  };
  return { win, script, appended, fire: (e: string) => (handlers[e] ?? []).forEach((f) => f()) };
}

beforeEach(() => resetCalendlyLoader());

describe("loadCalendly", () => {
  it("resolves the api once the bundle has loaded", async () => {
    const env = fakeWindow();
    const api = { initInlineWidget() {} };
    const pending = loadCalendly({ win: env.win });
    env.win.Calendly = api;
    env.fire("load");
    expect(await pending).toBe(api);
  });

  it("appends the stylesheet alongside the script", async () => {
    const env = fakeWindow();
    const pending = loadCalendly({ win: env.win });
    env.win.Calendly = { initInlineWidget() {} };
    env.fire("load");
    await pending;
    expect(env.appended.some((el: any) => el.href === CALENDLY_STYLE_HREF)).toBe(true);
    expect(env.script.src).toBe(CALENDLY_SCRIPT_SRC);
  });

  /*
   * Null rather than a rejection, so the dialog can offer the plain link.
   * An empty box and a console error is the worst of both.
   */
  it("resolves null when the bundle is blocked", async () => {
    const env = fakeWindow();
    const pending = loadCalendly({ win: env.win });
    env.fire("error");
    expect(await pending).toBeNull();
  });

  it("resolves null when the bundle never finishes loading", async () => {
    const env = fakeWindow();
    expect(await loadCalendly({ win: env.win, timeoutMs: 5 })).toBeNull();
  });

  it("stays settled when a timed-out bundle loads afterwards", async () => {
    const env = fakeWindow();
    const pending = loadCalendly({ win: env.win, timeoutMs: 5 });
    expect(await pending).toBeNull();
    env.win.Calendly = { initInlineWidget() {} };
    expect(() => env.fire("load")).not.toThrow();
    expect(await pending).toBeNull();
  });

  it("returns the api without touching the document when it is already there", async () => {
    const env = fakeWindow();
    const api = { initInlineWidget() {} };
    env.win.Calendly = api;
    expect(await loadCalendly({ win: env.win })).toBe(api);
    expect(env.appended).toHaveLength(0);
  });

  it("reuses a script tag already in the page", async () => {
    const env = fakeWindow({ existingScript: true });
    const pending = loadCalendly({ win: env.win });
    env.win.Calendly = { initInlineWidget() {} };
    env.fire("load");
    await pending;
    expect(env.appended.some((el: any) => el.src === CALENDLY_SCRIPT_SRC)).toBe(false);
  });

  it("resolves null rather than throwing when there is no document", async () => {
    expect(await loadCalendly({ win: {} as any })).toBeNull();
  });
});
