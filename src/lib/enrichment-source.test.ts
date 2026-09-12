import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { displayEnrichmentSource, PLATFORM_SOURCE_LABEL } from "./enrichment-source";

/**
 * A user saw "Source: railway" on an enriched lead.
 *
 * The sheet masked provider names with an allow-list, so the ones someone had
 * remembered to add became "OutReign" and everything else rendered raw. That
 * shape leaks by default, and it leaks exactly when a provider is added by
 * someone not thinking about this file — which is how both 'railway' and
 * 'bloomberry' ended up one render away from a customer.
 */
describe("no vendor or infrastructure name reaches the user", () => {
  it.each([
    ["railway", "the one that shipped"],
    ["bloomberry", "written by detect-tech-signals"],
    ["prospeo", "was on the old allow-list"],
    ["peopledatalabs", "was on the old allow-list"],
    ["Lusha", "was on the old allow-list"],
    ["a-provider-nobody-has-added-yet", "the case the allow-list could not cover"],
    ["RAILWAY", "case does not help it through"],
  ])("%s is masked (%s)", (source) => {
    expect(displayEnrichmentSource(source)).toBe(PLATFORM_SOURCE_LABEL);
  });

  it.each([[null], [undefined], [""], ["   "]])("empty source still reads as ours: %s", (source) => {
    expect(displayEnrichmentSource(source as string | null)).toBe(PLATFORM_SOURCE_LABEL);
  });
});

describe("the user's own origins are theirs", () => {
  it.each(["CSV", "csv import", "Manual", "import"])("%s renders as written", (source) => {
    expect(displayEnrichmentSource(source)).toBe(source);
  });
});

describe("the call site", () => {
  const SHEET = readFileSync("src/components/dashboard/LeadDetailSheet.tsx", "utf8");

  it("no longer inlines a list of provider names", () => {
    expect(SHEET).not.toContain("'peopledatalabs'");
    expect(SHEET).not.toContain("'prospeo'");
    expect(SHEET).toContain("displayEnrichmentSource(entry.source)");
  });

  it("leaves leads.source alone, which the user typed themselves", () => {
    // Add Lead takes free text and import sets "CSV". Masking those would be
    // rewriting the user's own words back at them.
    expect(SHEET).toContain("Source: {lead.source}");
  });
});
