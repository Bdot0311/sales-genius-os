import { describe, expect, it } from "vitest";
import { lineGrounding } from "../../supabase/functions/_shared/evidence-contract";

const FACTS = ["Bluejay helps teams test voice agents across real customer scenarios before launch."];
const SENDER = "We build AI SDR agents that research leads and draft personalized outbound emails.";

describe("lines around the researched fact", () => {
  it("allows an idea tying the sender's offer to the researched topic", () => {
    expect(lineGrounding("One idea: our agents could research teams testing voice agents and draft outbound emails.", FACTS, SENDER, "bluejay")).toBe("idea");
  });
  it("allows the sender's own offer in their words", () => {
    expect(lineGrounding("We build AI SDR agents that draft personalized outbound emails.", FACTS, SENDER, "bluejay")).toBe("offer");
  });
  it("refuses an invented result", () => {
    expect(lineGrounding("We helped Acme book 40 meetings in a month.", FACTS, SENDER, "bluejay")).toBeNull();
  });
  it("refuses a claim stated as known about the prospect", () => {
    expect(lineGrounding("I noticed your team is struggling with outbound.", FACTS, SENDER, "bluejay")).toBeNull();
  });
  it("refuses a number the sender never gave", () => {
    expect(lineGrounding("We could draft 500 emails for your team.", FACTS, SENDER, "bluejay")).toBeNull();
  });
});

import { readableSentence } from "../../supabase/functions/_shared/evidence-contract";
describe("navigation text is not a fact", () => {
  it("refuses link arrows and follow-us lines", () => {
    expect(readableSentence("Search Los Angeles building inspections → Follow MAREA.ai on LinkedInAnalysis on transparency, approval systems, and better outcomes.")).toBe(false);
  });
});
