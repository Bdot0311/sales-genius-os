import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { askedWork, listLeadGuidance, listLeadsKey, normalizeListArgs } from "../../supabase/functions/_shared/list-leads-steer";

// Execute the actual dispatcher branch with an owner-scoped in-memory query.
function dispatcher() {
  const source = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
  const branch = source.slice(source.indexOf('case "list_leads":'), source.indexOf('case "get_lead":'));
  const records = [
    { id: "a-1", tier: "a", user_id: "owner" },
    { id: "b-1", tier: "b", user_id: "owner" },
    { id: "other-1", tier: "a", user_id: "other" },
  ];
  const drafted = new Set<string>();
  let queries = 0;
  const admin = { from: () => {
    queries += 1;
    let rows = records.slice();
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key as keyof typeof row] === value); return query; },
      order: () => query,
      limit: async (limit: number) => ({ data: rows.slice(0, limit), error: null }),
      range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
    };
    return query;
  } };
  const compiled = ts.transpileModule(`
    const listLeadKeys = new Map<string, number>();
    let listLeadCalls = 0, listedLeadIds: string[] = [], listedQueuedCount = 0;
    let outstandingPool: string[] = [];
    const toolEvents = [], userId = "owner", LEAD_FIELDS = "*", NO_MATCH_ID = "none";
    const asked = askedWork("research leads");
    return { run: async (args) => { const name = "list_leads"; switch(name) { ${branch} } },
      ids: () => listedLeadIds, outstanding: () => outstandingPool };
  `, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const create = new Function("admin", "askedWork", "listLeadGuidance", "listLeadsKey", "normalizeListArgs", "leadsWithDrafts", "draftQueueAmong", "listLeadsCopy", compiled);
  const handler = create(admin, askedWork, listLeadGuidance, listLeadsKey, normalizeListArgs,
    async (_admin: unknown, _owner: string, ids: string[]) => new Set(ids.filter(id => drafted.has(id))),
    async () => 0, () => ({ label: "Listed", detail: "Listed" }));
  return { ...handler, drafted, queries: () => queries };
}

describe("agent list lookup dispatch", () => {
  it("rechecks tier A after tier B with fresh draft counts and the correct batch", async () => {
    const chat = dispatcher();
    await chat.run({ tier: "A" });
    await chat.run({ tier: "B" });
    chat.drafted.add("a-1");
    const recheck = await chat.run({ tier: "A" });
    expect(recheck.leads.map((lead: { id: string }) => lead.id)).toEqual(["a-1"]);
    expect(recheck.remaining_without_draft).toBe(0);
    expect(chat.ids()).toEqual(["a-1"]);
  });

  it("returns no substitute ids on a seventh new filter and clears implicit batches", async () => {
    const chat = dispatcher();
    await chat.run({ tier: "a", without_draft: true });
    for (let limit = 1; limit <= 5; limit++) await chat.run({ tier: "b", limit });
    const before = chat.queries();
    const stopped = await chat.run({ tier: "unscored" });
    expect(stopped.error).toBe("list_leads_limit");
    expect(stopped.lead_ids).toEqual([]);
    expect(stopped.count).toBeUndefined();
    expect(chat.ids()).toEqual([]);
    expect(chat.outstanding()).toEqual([]);
    expect(chat.queries()).toBe(before);
  });

  it("clears the previous batch when a fresh lookup has no matching leads", async () => {
    const chat = dispatcher();
    await chat.run({ tier: "a" });
    chat.drafted.add("a-1");
    const empty = await chat.run({ tier: "a", without_draft: true });
    expect(empty.leads).toEqual([]);
    expect(chat.ids()).toEqual([]);
  });
});