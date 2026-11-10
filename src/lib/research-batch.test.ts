import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextResearchSlice } from "../../supabase/functions/_shared/research-batch";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `lead-${i + 1}`);

describe("a resumed research pass takes the next leads", () => {
  const pool = ids(63);
  const first = pool.slice(0, 12);

  it("skips the 12 already researched and returns the next 12", () => {
    const plan = nextResearchSlice({
      requested: first,
      done: first,
      pool,
      limit: 12,
    });
    expect(plan.inline).toEqual(pool.slice(12, 24));
    expect(plan.queue).toEqual(pool.slice(24));
    expect(plan.inline.some((id) => first.includes(id))).toBe(false);
  });

  it("does not research the rest of the list when the request is smaller", () => {
    const three = ["lead-a", "lead-b", "lead-c"];
    const plan = nextResearchSlice({
      requested: three,
      done: [],
      pool,
      limit: 12,
    });
    expect(plan.inline).toEqual(three);
    expect(plan.queue).toEqual([]);
  });

  it("queues only the rest of the request, not the unrequested pool", () => {
    const asked = pool.slice(20, 35);
    const plan = nextResearchSlice({
      requested: asked,
      done: [],
      pool,
      limit: 12,
    });
    expect(plan.inline).toEqual(asked.slice(0, 12));
    expect(plan.queue).toEqual(asked.slice(12));
    expect(plan.queue.some((id) => !asked.includes(id))).toBe(false);
  });

  it("is what research_leads uses, and a held lead with a brief is not a fresh failure", () => {
    const agent = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
    const research = readFileSync("supabase/functions/research-lead/index.ts", "utf8");
    const branch = agent.slice(agent.indexOf('case "research_leads":'), agent.indexOf('case "draft_outreach":'));
    expect(branch.indexOf("nextResearchSlice(")).toBeLessThan(branch.indexOf("mapLimit"));
    expect(branch).toContain("allDone ? listedLeadIds : rawRequested");
    expect(branch).toContain("researchedLeadIds");
    expect(research).toContain("function heldResearch");
    expect(research).toContain("if (cachedBrief && typeof cachedBrief === \"object\")");
    expect(agent).toContain("confirmedClose(");
  });
});
