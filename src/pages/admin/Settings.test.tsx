// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  realtime: [] as Array<() => Promise<void>>,
  fail: false,
  toast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: fixture.toast }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({ select: () => ({ order: async () => ({
      data: table === "feature_flags" ? [{ id: "flag-1", name: "test", is_enabled: false }] : [],
      error: fixture.fail ? { message: "test read failure" } : null,
    }) }) }),
    channel: () => {
      const channel = {
        on: (_event: string, _filter: unknown, callback: () => Promise<void>) => {
          fixture.realtime.push(callback);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/components/admin/EmailLogsPanel", () => ({ EmailLogsPanel: () => null }));
vi.mock("@/components/admin/DemoModeCard", () => ({ DemoModeCard: () => null }));
vi.mock("@/components/admin/ChangelogTab", () => ({ ChangelogTab: () => null }));
vi.mock("@/components/admin/LeadIntelligencePanel", () => ({ LeadIntelligencePanel: () => null }));
vi.mock("@/components/admin/VisitorAccessCard", () => ({ VisitorAccessCard: () => null }));
vi.mock("@/components/admin/AgentMissionAccessCard", () => ({ AgentMissionAccessCard: () => null }));
vi.mock("@/components/admin/AgentBuildCard", () => ({ AgentBuildCard: () => null }));

import AdminSettings from "./Settings";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  fixture.fail = false;
  fixture.realtime = [];
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function open(path = "/admin/settings?section=features") {
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}><AdminSettings /></MemoryRouter>));
}

function activeTab() {
  return container.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
}

describe("admin Settings refresh stability", () => {
  it("restores Features directly from the page URL", async () => {
    await open();
    expect(activeTab()).toBe("Features");
  });

  it("keeps Features and an open unsaved editor mounted after the 60-second refresh", async () => {
    await open();
    const add = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Add Flag"));
    if (!add) throw new Error("Add Flag not found");
    await act(async () => add.click());
    const input = document.getElementById("flag-name") as HTMLInputElement | null;
    if (!input) throw new Error("Editor input not found");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      if (!setter) throw new Error("Input value setter unavailable");
      setter.call(input, "unsaved-flag");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(activeTab()).toBe("Features");
    expect(document.getElementById("flag-name")).toBe(input);
    expect(input.value).toBe("unsaved-flag");
  });

  it("keeps the selected tab panel mounted across focus and realtime refreshes", async () => {
    await open("/admin/settings?section=api");
    const input = document.getElementById("rate-limit-minute");
    expect(input).not.toBeNull();
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await act(async () => { await Promise.all(fixture.realtime.map((callback) => callback())); });
    expect(activeTab()).toBe("API");
    expect(document.getElementById("rate-limit-minute")).toBe(input);
  });

  it("does not reset the selected tab if a background read fails", async () => {
    await open("/admin/settings?section=billing");
    fixture.fail = true;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(activeTab()).toBe("Billing");
    expect(fixture.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Error loading settings" }));
  });
});