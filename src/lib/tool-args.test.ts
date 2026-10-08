import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  invalidArgsResult,
  validateToolArgs,
  type ArgCheck,
  type ToolSchema,
} from "../../supabase/functions/_shared/tool-args";

/**
 * Thirty-five tools declared parameter schemas. Nothing read them back.
 *
 * Arguments arrived as `any` and were coerced by hand at each call site, so a
 * call that did not match its own schema turned into strange behaviour
 * somewhere downstream instead of a rejection the model could act on. The
 * quiet ones were the worst: a missing `lead_ids` read as an empty list and
 * the tool reported doing nothing to nobody, and arguments that would not
 * parse became `{}` — which for `list_leads`, whose parameters are all
 * filters, is every lead on the account.
 */

/**
 * Assert the call was rejected and hand back the reasons.
 *
 * Cast rather than narrowed: this project's tsconfig is loose enough that
 * discriminating the union on `ok` does not hold, and the throw above is what
 * actually guarantees the branch.
 */
const rejected = (r: ArgCheck): string[] => {
  if (r.ok) throw new Error("expected these arguments to be rejected, but they passed");
  return (r as { ok: false; errors: string[] }).errors;
};

/** The shape list_leads actually declares: scalars, an enum, nothing required. */
const LIST_LEADS: ToolSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    pipeline_stage: { type: "string", enum: ["new", "contacted", "replied"] },
    min_icp_score: { type: "number" },
    awaiting_reply: { type: "boolean" },
    limit: { type: "number" },
  },
};

/** The shape the drafting tools declare: a required list of ids. */
const DRAFT_OUTREACH: ToolSchema = {
  type: "object",
  properties: {
    lead_ids: { type: "array", items: { type: "string" } },
    goal: { type: "string", enum: ["introduction", "follow-up"], default: "introduction" },
    feedback: { type: "string" },
  },
  required: ["lead_ids"],
};

describe("it accepts what the model actually sends", () => {
  it("takes a well-formed call unchanged", () => {
    const r = validateToolArgs(LIST_LEADS, { query: "acme", limit: 25 });
    expect(r).toEqual({ ok: true, args: { query: "acme", limit: 25 } });
  });

  it("coerces a number sent as text", () => {
    // Models do this constantly, and the hand-written call sites took it.
    const r = validateToolArgs(LIST_LEADS, { limit: "25" });
    expect(r.ok && r.args.limit).toBe(25);
  });

  it("coerces a boolean sent as text", () => {
    const r = validateToolArgs(LIST_LEADS, { awaiting_reply: "true" });
    expect(r.ok && r.args.awaiting_reply).toBe(true);
    const f = validateToolArgs(LIST_LEADS, { awaiting_reply: "FALSE" });
    expect(f.ok && f.args.awaiting_reply).toBe(false);
  });

  it("reads a number back as text where a string is declared", () => {
    const r = validateToolArgs(LIST_LEADS, { query: 2024 });
    expect(r.ok && r.args.query).toBe("2024");
  });

  it("wraps a bare value where a list belongs", () => {
    // `lead_ids: "abc"` is the commonest shape error in a tool call and the
    // intent is never ambiguous. Refusing costs a turn to reach the same place.
    const r = validateToolArgs(DRAFT_OUTREACH, { lead_ids: "abc" });
    expect(r.ok && r.args.lead_ids).toEqual(["abc"]);
  });

  it("fills a declared default when the argument is absent", () => {
    const r = validateToolArgs(DRAFT_OUTREACH, { lead_ids: ["a"] });
    expect(r.ok && r.args.goal).toBe("introduction");
  });

  it("keeps keys the schema does not mention", () => {
    // Nothing here sets additionalProperties, so dropping them would discard
    // data a tool may read deliberately.
    const r = validateToolArgs(LIST_LEADS, { query: "x", internal_hint: "keep me" });
    expect(r.ok && r.args.internal_hint).toBe("keep me");
  });

  it("lets a tool with no declared parameters take anything", () => {
    expect(validateToolArgs(undefined, { whatever: 1 })).toEqual({ ok: true, args: { whatever: 1 } });
  });
});

describe("it refuses what would have gone wrong quietly", () => {
  it("catches a missing required argument", () => {
    // This read as an empty list, and the tool reported doing nothing.
    const r = validateToolArgs(DRAFT_OUTREACH, { goal: "follow-up" });
    expect(r.ok).toBe(false);
    expect(rejected(r).join()).toContain("lead_ids is required");
  });

  it("treats null and empty string as missing, not as a value", () => {
    expect(validateToolArgs(DRAFT_OUTREACH, { lead_ids: null }).ok).toBe(false);
    expect(validateToolArgs(DRAFT_OUTREACH, { lead_ids: "" }).ok).toBe(false);
  });

  it("catches a number that is not one", () => {
    const r = validateToolArgs(LIST_LEADS, { limit: "all" });
    expect(r.ok).toBe(false);
    expect(rejected(r).join()).toContain("limit must be a number");
  });

  it("catches a value outside a declared enum", () => {
    const r = validateToolArgs(LIST_LEADS, { pipeline_stage: "warm" });
    expect(r.ok).toBe(false);
    expect(rejected(r).join()).toContain('"new"');
  });

  it("catches arguments that are not an object at all", () => {
    expect(validateToolArgs(LIST_LEADS, "acme").ok).toBe(false);
    expect(validateToolArgs(LIST_LEADS, ["acme"]).ok).toBe(false);
  });

  it("reports every problem at once", () => {
    // One round trip beats the model fixing a parameter at a time.
    const r = validateToolArgs(LIST_LEADS, { limit: "all", pipeline_stage: "warm" });
    expect(rejected(r).length).toBe(2);
  });

  it("names the element, not just the list, inside an array", () => {
    const r = validateToolArgs(
      { type: "object", properties: { ids: { type: "array", items: { type: "number" } } } },
      { ids: [1, "two"] },
    );
    expect(rejected(r).join()).toContain("ids[1]");
  });
});

describe("the refusal is one the model can act on", () => {
  const result = invalidArgsResult("draft_outreach", ["lead_ids is required"]);

  it("is shaped like the scope refusal the model already handles", () => {
    expect(result.error).toBe("invalid_arguments");
    expect(result.tool).toBe("draft_outreach");
    expect(result.problems).toEqual(["lead_ids is required"]);
  });

  it("says what was wrong and what to do", () => {
    expect(result.note).toContain("lead_ids is required");
    expect(result.note).toContain("call it once more");
  });

  it("says nothing ran, so the turn cannot claim the work is done", () => {
    expect(result.note).toContain("nothing ran");
  });
});

/**
 * Wiring. The validator is worth nothing if the dispatch path skips it.
 */
describe("every tool call goes through it", () => {
  const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
  const bare = AGENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("builds the schema map from the same array the model is handed", () => {
    // Written out separately, a schema could drift from the one the model saw;
    // built from TOOLS, a tool added there is validated the moment it exists.
    expect(bare).toContain("const TOOL_SCHEMAS = new Map<string, ToolSchema>(");
    expect(bare).toContain("(TOOLS as any[])");
  });

  it("checks inside runTool, so no call site can bypass it", () => {
    expect(bare).toContain("const checked = validateToolArgs(TOOL_SCHEMAS.get(name), args);");
    expect(bare).toContain("return invalidArgsResult(name, checked.errors);");
  });

  it("runs after the scope gate and before the tool does anything", () => {
    const scope = bare.indexOf('error: "out_of_scope"');
    const check = bare.indexOf("const checked = validateToolArgs");
    const use = bare.indexOf("args = checked.args;");
    expect(scope).toBeGreaterThan(-1);
    expect(scope).toBeLessThan(check);
    expect(check).toBeLessThan(use);
  });

  it("rejects arguments that will not parse instead of calling with none", () => {
    expect(bare).toContain('invalidArgsResult(toolName, ["arguments were not valid JSON for an object"])');
    expect(bare).not.toMatch(/catch \{\s*args = \{\};\s*\}/);
  });
});
