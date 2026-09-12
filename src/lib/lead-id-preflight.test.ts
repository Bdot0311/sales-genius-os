import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A batch arrived with three lead ids the account does not have — carried over
 * from earlier in the conversation rather than looked up — and each cost a full
 * edge-function invocation before failing:
 *
 *   Opened lead — Lead not found        x3
 *   Enriched leads — 0/3 enriched
 *   Researched leads — 0/3 researched from their websites
 *
 * all shown to the user in red, before the agent gave up and ran list_leads and
 * did the whole job correctly. Nine wasted invocations to learn something one
 * indexed query answers.
 */
const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

describe("ids are checked before anything fans out", () => {
  it("has a single ownership pre-flight", () => {
    expect(AGENT).toContain("const ownedLeadIds = async (ids: string[])");
    expect(AGENT).toMatch(/\.eq\("user_id", userId\)\s*\n\s*\.in\("id", ids\)/);
  });

  it.each(["enrich_leads", "research_leads"])("%s runs it first", (tool) => {
    const branch = AGENT.slice(AGENT.indexOf(`case "${tool}": {`));
    const body = branch.slice(0, branch.indexOf("\n        case "));
    expect(body).toContain("await ownedLeadIds(requested)");
    // the pre-flight has to precede the fan-out, or it has bought nothing
    expect(body.indexOf("ownedLeadIds(requested)")).toBeLessThan(body.indexOf("mapLimit"));
  });

  it("stops entirely when nothing is real, rather than calling out N times", () => {
    expect(AGENT).toContain("None of those lead ids exist in this account");
    expect(AGENT).toContain("Call list_leads first");
  });

  it("says so once, not once per id", () => {
    expect(AGENT).toContain('label: "Unknown lead ids"');
  });

  it("is declared outside the switch, or a jump to a later case hits the TDZ", () => {
    // Declared inside the switch block, calling research_leads first would
    // jump past the declaration and throw a ReferenceError at runtime.
    expect(AGENT.indexOf("const ownedLeadIds = async")).toBeLessThan(AGENT.indexOf("switch (name) {"));
  });
});
