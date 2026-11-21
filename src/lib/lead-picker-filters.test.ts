import { describe, expect, it } from "vitest";
import { DEFAULT_LEAD_PICKER_FILTERS as D, leadMatchesPickerFilters as m } from "./lead-picker-filters";

describe("Outreach lead picker filters", () => {
  it("first touch means leads still labeled New, including unlabeled ones", () => {
    expect(m({ pipeline_stage: "new" }, { ...D, label: "first_touch" })).toBe(true);
    expect(m({ pipeline_stage: null }, { ...D, label: "first_touch" })).toBe(true);
    expect(m({ pipeline_stage: "contacted" }, { ...D, label: "first_touch" })).toBe(false);
  });
  it("follow-up means Contacted or No Response", () => {
    expect(m({ pipeline_stage: "contacted" }, { ...D, label: "follow_up" })).toBe(true);
    expect(m({ pipeline_stage: "no_response" }, { ...D, label: "follow_up" })).toBe(true);
    expect(m({ pipeline_stage: "replied" }, { ...D, label: "follow_up" })).toBe(false);
  });
  it("intent and enrichment filter like Saved Leads", () => {
    expect(m({ intent_label: "Hot" }, { ...D, intent: "Cold" })).toBe(false);
    expect(m({ enriched_at: "2026-11-01" }, { ...D, enrichment: "not_enriched" })).toBe(false);
    expect(m({}, { ...D, enrichment: "not_enriched" })).toBe(true);
  });
});
