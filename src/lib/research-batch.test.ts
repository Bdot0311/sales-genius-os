import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  askedForWholeList,
  explicitResearchCount,
  nextResearchSlice,
  researchContinueLine,
} from "../../supabase/functions/_shared/research-batch";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `lead-${i + 1}`);

describe("a resumed research pass takes the next leads", () => {
  const pool = ids(63);
  const first = pool.slice(0, 12);

  it("a whole-list resume skips the 12 already researched and returns the next 12", () => {
    const plan = nextResearchSlice({
      requested: first,
      done: first,
      pool,
      limit: 12,
      wholeList: true,
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

  it("repeating three finished ids does not research the rest of the list", () => {
    const three = ["lead-a", "lead-b", "lead-c"];
    const plan = nextResearchSlice({
      requested: three,
      done: three,
      pool,
      limit: 12,
    });
    expect(plan.inline).toEqual([]);
    expect(plan.queue).toEqual([]);
  });

  it("still continues a whole-list ask after the named ids are done", () => {
    const plan = nextResearchSlice({
      requested: pool.slice(0, 3),
      done: pool.slice(0, 3),
      pool,
      limit: 12,
      wholeList: true,
    });
    expect(plan.inline).toEqual(pool.slice(3, 15));
    expect(plan.queue).toEqual(pool.slice(15));
  });

  it("takes the count on the research phrase, not a later draft count", () => {
    expect(explicitResearchCount("research these 3, then draft 2 leads")).toBe(3);
    expect(askedForWholeList("research these 3, then draft 2 leads", pool.length)).toBe(false);
  });

  it("lets a research count beat an incidental mention of how many leads exist", () => {
    const message = "I have 63 leads, research 5 of them";
    expect(explicitResearchCount(message)).toBe(5);
    expect(askedForWholeList(message, pool.length)).toBe(false);
    expect(askedForWholeList("There are 63 leads labeled New. Please research them.", pool.length)).toBe(true);
  });

  it("does not tell a small request to research the full list again", () => {
    expect(askedForWholeList("research these 3, then draft them")).toBe(false);
    expect(askedForWholeList("There are 63 leads labeled New. Please research them.", pool.length)).toBe(true);
    expect(askedForWholeList("research 20 leads", pool.length)).toBe(false);
    expect(askedForWholeList("research 20 leads")).toBe(false);
    expect(askedForWholeList("research the top 15 leads", pool.length)).toBe(false);
    expect(askedForWholeList("research all 63 leads")).toBe(true);
    expect(researchContinueLine(3, false)).not.toContain("full list");
    expect(researchContinueLine(12, true)).toContain("not the same 12");
  });

  it("caps research 20 leads at 20 total across repeats of a 63-id pool", () => {
    const message = "research 20 leads";
    const cap = explicitResearchCount(message);
    const wholeList = askedForWholeList(message, pool.length);
    expect(cap).toBe(20);
    expect(wholeList).toBe(false);

    const opened = nextResearchSlice({
      requested: pool,
      done: [],
      pool,
      limit: 12,
      wholeList,
      cap,
    });
    expect(opened.inline).toEqual(pool.slice(0, 12));
    expect(opened.queue).toEqual(pool.slice(12, 20));
    expect(opened.inline.length + opened.queue.length).toBe(20);

    const repeated = nextResearchSlice({
      requested: first,
      done: first,
      pool,
      limit: 12,
      wholeList,
      cap,
    });
    expect(repeated.inline).toEqual([]);
    expect(repeated.queue).toEqual([]);

    const filled = nextResearchSlice({
      requested: pool,
      done: first,
      pool,
      limit: 12,
      wholeList,
      cap,
    });
    const committed = [...first, ...filled.inline, ...filled.queue];
    expect(committed).toEqual(pool.slice(0, 20));
    expect(new Set(committed).size).toBe(20);

    const again = nextResearchSlice({
      requested: pool,
      done: committed,
      pool,
      limit: 12,
      wholeList,
      cap,
    });
    expect(again.inline).toEqual([]);
    expect(again.queue).toEqual([]);
  });

  it("returns nothing when research these 12 is repeated", () => {
    const message = "research these 12";
    const twelve = pool.slice(0, 12);
    expect(askedForWholeList(message, pool.length)).toBe(false);
    expect(explicitResearchCount(message)).toBe(12);
    const plan = nextResearchSlice({
      requested: twelve,
      done: twelve,
      pool,
      limit: 12,
      wholeList: askedForWholeList(message, pool.length),
      cap: explicitResearchCount(message),
    });
    expect(plan.inline).toEqual([]);
    expect(plan.queue).toEqual([]);
  });

  it("still continues research all 63 leads and research them all", () => {
    for (const message of ["research all 63 leads", "research them all"]) {
      const wholeList = askedForWholeList(message, pool.length);
      expect(wholeList).toBe(true);
      const plan = nextResearchSlice({
        requested: first,
        done: first,
        pool,
        limit: 12,
        wholeList,
        cap: explicitResearchCount(message),
      });
      expect(plan.inline).toEqual(pool.slice(12, 24));
      expect(plan.queue).toEqual(pool.slice(24));
      expect(plan.inline.some((id) => first.includes(id))).toBe(false);
    }
  });

  it("does not tell a capped ask to call research_leads with the full list", () => {
    const line = researchContinueLine(12, askedForWholeList("research 20 leads", pool.length));
    expect(line).not.toContain("full list");
    expect(line).not.toContain("Call research_leads with the full list");
    expect(researchContinueLine(12, askedForWholeList("research the top 15 leads", pool.length)))
      .not.toContain("full list");
    expect(researchContinueLine(12, askedForWholeList("research them all", pool.length)))
      .toContain("Call research_leads with the full list");
    expect(researchContinueLine(12, askedForWholeList("research all 63 leads", pool.length)))
      .toContain("not the same 12");
  });

  it("is what research_leads uses, and a held lead with a brief is not a fresh failure", () => {
    const agent = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
    const research = readFileSync("supabase/functions/research-lead/index.ts", "utf8");
    const branch = agent.slice(agent.indexOf('case "research_leads":'), agent.indexOf('case "draft_outreach":'));
    const early = branch.indexOf("allDone && !batch");
    expect(early).toBeGreaterThan(-1);
    expect(early).toBeLessThan(branch.indexOf("ownedLeadIds("));
    expect(early).toBeLessThan(branch.indexOf('queueWork("research"'));
    expect(branch.indexOf("nextResearchSlice(")).toBeLessThan(branch.indexOf("mapLimit"));
    expect(branch).toContain("batch ? listedLeadIds : rawRequested");
    expect(branch).toContain("askedForWholeList(userMessage, listedLeadIds.length)");
    expect(branch).toContain("cap: researchCap");
    expect(branch).toContain("explicitResearchCount(userMessage)");
    expect(branch).toContain("queuedResearchLeadIds");
    expect(branch).toContain("Call list_leads and pass the ids it returns.");
    expect(agent).toContain("researchContinueLine(");
    expect(agent).toContain("askedForWholeList(userMessage, listedLeadIds.length)");
    expect(branch).toContain("researchedLeadIds");
    expect(research).toContain("function heldResearch");
    expect(research).toContain("if (cachedBrief && typeof cachedBrief === \"object\")");
    expect(agent).toContain("confirmedClose(");
  });
});
