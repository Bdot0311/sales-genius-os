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

  /*
   * "On research it just shows saw on site, saw on site, no other sources."
   *
   * The heading was the constant string "Observed on their site", so a
   * finding from an independent publisher said the same thing as one lifted
   * off the prospect's homepage. The panel could not be used to tell whether
   * the outside half of research had run.
   */
  const monar = {
    confidence: "medium",
    sources: [
      "https://monar.com/",
      "https://monar.com/product",
      "https://monar.com/about",
      "https://techcrunch.com/2026/01/02/monar",
    ],
    observations: [
      { fact: "Monar launched Canvas Speaker on Kickstarter.", source: "https://monar.com/product" },
      { fact: "Monar partnered with Smartech for Selfridges London.", source: "https://monar.com/about" },
      { fact: "Monar raised a seed round led by Acme.", source: "https://techcrunch.com/2026/01/02/monar" },
    ],
  };

  it("separates what was read elsewhere from what was read on their site", () => {
    act(() => { root.render(<LeadResearchPanel defaultOpen research={monar} />); });
    const text = host.textContent ?? "";
    expect(text).toContain("Observed on their site");
    expect(text).toContain("Found elsewhere");
    // The outside finding names its publisher without opening a tab.
    expect(text).toContain("techcrunch.com");
  });

  it("puts each finding under the right heading", () => {
    act(() => { root.render(<LeadResearchPanel defaultOpen research={monar} />); });
    const text = host.textContent ?? "";
    const site = text.indexOf("Observed on their site");
    const outside = text.indexOf("Found elsewhere");
    expect(site).toBeGreaterThanOrEqual(0);
    expect(outside).toBeGreaterThan(site);
    expect(text.indexOf("Canvas Speaker on Kickstarter")).toBeLessThan(outside);
    expect(text.indexOf("raised a seed round")).toBeGreaterThan(outside);
  });

  it("shows no 'found elsewhere' heading when everything came from their site", () => {
    act(() => {
      root.render(
        <LeadResearchPanel
          defaultOpen
          research={{
            confidence: "medium",
            sources: ["https://monar.com/", "https://monar.com/product"],
            observations: [{ fact: "Monar launched Canvas Speaker.", source: "https://monar.com/product" }],
          }}
        />,
      );
    });
    const text = host.textContent ?? "";
    expect(text).toContain("Observed on their site");
    expect(text).not.toContain("Found elsewhere");
  });

  it("picks the lead's own host by how often it was read, not by what came first", () => {
    /*
     * An outside source can be the first URL in the list. Taking the first
     * host as the prospect's own would then file their whole website under
     * "found elsewhere" and the publisher under "their site" -- the label
     * exactly inverted. The site crawl contributes several pages from one
     * host and each outside source contributes one, so frequency is what
     * identifies it.
     */
    act(() => {
      root.render(
        <LeadResearchPanel
          defaultOpen
          research={{
            confidence: "medium",
            sources: [
              "https://techcrunch.com/2026/01/02/monar",
              "https://monar.com/",
              "https://monar.com/product",
              "https://monar.com/about",
            ],
            observations: [
              { fact: "Monar raised a seed round led by Acme.", source: "https://techcrunch.com/2026/01/02/monar" },
              { fact: "Monar launched Canvas Speaker on Kickstarter.", source: "https://monar.com/product" },
            ],
          }}
        />,
      );
    });
    const text = host.textContent ?? "";
    const site = text.indexOf("Observed on their site");
    const outside = text.indexOf("Found elsewhere");
    expect(site).toBeGreaterThanOrEqual(0);
    expect(outside).toBeGreaterThan(site);
    expect(text.indexOf("Canvas Speaker on Kickstarter")).toBeLessThan(outside);
    expect(text.indexOf("raised a seed round")).toBeGreaterThan(outside);
  });

  it("stops the confidence line claiming the site when it was not the only source", () => {
    /*
     * "Some findings from their site" was printed under a card whose findings
     * included independent coverage.
     */
    act(() => { root.render(<LeadResearchPanel defaultOpen research={monar} />); });
    const text = host.textContent ?? "";
    expect(text).toContain("Some findings");
    expect(text).not.toContain("Some findings from their site");
  });
});
