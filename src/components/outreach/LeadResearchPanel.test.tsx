// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LeadResearchPanel } from "./LeadResearchPanel";

describe("research status on the lead", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows thin research and each provider status", () => {
    act(() => {
      root.render(
        <LeadResearchPanel
          defaultOpen
          research={{
            thin_research: true,
            what_they_do: "Proxy voting software",
            retrieval: {
              firecrawl: { status: "ok", stored: 1 },
              parallel: { status: "empty" },
              context_dev: { status: "error", error: "timeout" },
            },
          }}
        />,
      );
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Thin research — this draft uses only the role, company, and industry");
    expect(text).toContain("Firecrawl: ok");
    expect(text).toContain("Parallel: empty");
    expect(text).toContain("Context: error");
  });
});
