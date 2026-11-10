/** @vitest-environment jsdom */
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { AgentStepList } from "./AgentStepList";

describe("agent step list", () => {
  it("shows a warning for a zero research result and hides the longer note until opened", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(AgentStepList, {
        events: [
          {
            name: "research_leads",
            label: "Couldn't research these companies (0 of 12)",
            status: "error",
            detail: "0 of 12 came back with website research. No company website on this lead.",
          },
          {
            name: "research_leads",
            label: "Couldn't research these companies (0 of 12)",
            status: "error",
            detail: "0 of 12 came back with website research. No company website on this lead.",
          },
          {
            name: "draft_outreach",
            label: "Writing them in the background",
            status: "queued",
            detail: "They'll show up in Drafts as they finish.",
          },
        ],
      }));
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Couldn't research these companies (0 of 12)");
    expect(text).toContain("(2)");
    expect(text).not.toContain("No company website");
    const opener = host.querySelector("button");
    expect(opener).toBeTruthy();
    await act(async () => {
      opener!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(host.textContent).toContain("No company website");
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
