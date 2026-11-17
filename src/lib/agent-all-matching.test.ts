import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { listLeadGuidance } from "../../supabase/functions/_shared/list-leads-steer";

const src = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

describe("agent acts on whole lead sets", () => {
  it("research_leads and draft_outreach resolve all_matching to the full matched set", () => {
    expect(src).toMatch(/args\.all_matching === true && listedMatchIds\.length > 0\s*\?\s*\[\.\.\.listedMatchIds\]/);
    expect(src).toMatch(/args\.all_matching === true && listedMatchIds\.length > 0\s*\?\s*listedMatchIds/);
  });
  it("guidance never tells the user to start a new turn to get the rest", () => {
    const g = listLeadGuidance({ priorTotal: 6, priorSame: 0, knownCount: 0, queuedCount: 0, returnedCount: 0, asked: { research: true, evaluate: false, draft: true } });
    expect(g.note).not.toMatch(/new turn/);
    const n = listLeadGuidance({ priorTotal: 0, priorSame: 0, knownCount: 15, queuedCount: 0, returnedCount: 15, asked: { research: true, evaluate: false, draft: true } });
    expect(n.note).toContain("all_matching: true");
  });
});
