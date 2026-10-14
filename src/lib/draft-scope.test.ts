import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CHAT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const bare = CHAT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/**
 * "Draft for these 49 new leads" produced 162 drafts.
 *
 * The end-of-turn sweep exists so a model that splits a list, miscounts it or
 * stops early cannot silently lose anybody: whatever it declared outstanding
 * gets drafted or queued. The set it declared was outstandingPool, and that was
 * assigned allUndrafted — every matching lead on the ACCOUNT, ignoring the
 * limit on the call that produced it.
 *
 * So list_leads(limit: 49) committed the turn to the account's whole backlog.
 * The sweep queued the other 140 under a line reading "the whole set is
 * accounted for", and the user got a hundred and forty drafts they never asked
 * for with no way to tell which forty-nine they wanted.
 */
describe("the turn commits to what was asked for", () => {
  it("bounds the pool by the limit the model passed", () => {
    expect(bare).toContain("outstandingPool = allUndrafted.slice(0, limit);");
    expect(bare).not.toContain("outstandingPool = allUndrafted;");
  });

  it("still reports the account-wide backlog, which is not a commitment", () => {
    // remaining_without_draft is the number worth quoting to the user; it is
    // the figure the model is told to repeat. Only the committed set shrank.
    expect(bare).toContain("const outstanding = Math.max(undraftedIds.length, allUndrafted.length);");
    expect(bare).toContain("remaining_without_draft: outstanding,");
  });

  it("the pool is a superset of the page the model saw", () => {
    // Same filters, same ordering, sliced at the same limit — so every id the
    // model was shown is in the set the sweep can finish.
    const at = bare.indexOf('case "list_leads"');
    const call = bare.slice(at, bare.indexOf("remaining_without_draft", at));
    expect(call).toContain('.order("created_at", { ascending: false })');
    expect(call).toContain("const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);");
  });

  it("only sweeps when the model actually worked from the pool", () => {
    expect(bare).toContain("const drewFromPool = outstandingPool.some((id) => handledLeadIds.has(id));");
    expect(bare).toContain("if (outstandingPool.length > 0 && drewFromPool) {");
  });

  it("says this request, not the whole account, when it sweeps", () => {
    expect(CHAT).toContain("lead(s) in this request were not drafted or");
  });
});
