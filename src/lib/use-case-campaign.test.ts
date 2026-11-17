import { describe, expect, it } from "vitest";
import { useCaseCampaignFor } from "../../supabase/functions/_shared/use-case-campaign.ts";

describe("research-led campaign selection", () => {
  it("selects the three-idea campaign explicitly", () => {
    expect(useCaseCampaignFor("three_ideas")).toBe("three_ideas");
    expect(useCaseCampaignFor("", "Give this prospect 3 specific ideas")).toBe("three_ideas");
    expect(useCaseCampaignFor("", "Use the 3-idea campaign")).toBe("three_ideas");
  });
  it("selects a single-sentence campaign from agent instructions", () => {
    expect(useCaseCampaignFor("one_sentence")).toBe("one_sentence");
    expect(useCaseCampaignFor("", "Draft a one-sentence email")).toBe("one_sentence");
  });
  it("keeps existing campaigns unchanged unless requested", () => {
    expect(useCaseCampaignFor("signal_funding", "Use verified funding research")).toBe(null);
  });
  it("gives an explicit selection priority over feedback", () => {
    expect(useCaseCampaignFor("one_sentence", "three-idea campaign")).toBe("one_sentence");
  });
});