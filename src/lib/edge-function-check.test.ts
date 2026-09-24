import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SCRIPT = readFileSync("scripts/check-edge-functions.mjs", "utf8");
const WORKFLOW = readFileSync(".github/workflows/schema-check.yml", "utf8");
const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");

/**
 * `draft_outreach` shipped an enqueue block that read `feedback` two thousand
 * characters before its `const` was declared. tsc reported it as TS2448 every
 * time; the by-hand check grepped for TS1xxx only and threw it away. Deployed,
 * it threw "Cannot access 'feedback' before initialization" on every draft of
 * more than twelve leads — the exact path the queue exists for — so the feature
 * could not work, and the failure looked like the agent misbehaving.
 */
describe("the enqueue reads nothing before it exists", () => {
  it("declares feedback before the queue uses it", () => {
    const tool = AGENT.slice(AGENT.indexOf('case "draft_outreach"'), AGENT.indexOf('case "draft_sequence"'));
    const declared = tool.indexOf("const feedback = String(args.feedback");
    const used = tool.indexOf("feedback: feedback || null");
    expect(declared).toBeGreaterThan(-1);
    expect(used).toBeGreaterThan(-1);
    expect(declared).toBeLessThan(used);
  });

  it("still queues before the inline drafts run", () => {
    // Moving the block must not lose why it was early: a turn that dies
    // part-way through drafting has to keep the batch.
    const tool = AGENT.slice(AGENT.indexOf('case "draft_outreach"'), AGENT.indexOf('case "draft_sequence"'));
    expect(tool.indexOf('.from("agent_jobs")')).toBeLessThan(tool.indexOf("await mapLimit(ids, 3, genOne)"));
  });
});

describe("the check that would have caught it", () => {
  it("treats use-before-declaration as fatal", () => {
    expect(SCRIPT).toContain("TS2448");
    expect(SCRIPT).toContain("TS2454");
    // And syntax errors, which the old grep did catch.
    expect(SCRIPT).toMatch(/\^TS1\\d\{3\}\$/);
  });

  it("does not claim to be a full typecheck", () => {
    // Without Deno the https:// imports cannot be fetched, so most of what tsc
    // says really is noise. A check that overclaims is one people learn to
    // ignore.
    expect(SCRIPT).toContain("does NOT type-check the edge functions properly");
  });

  it("requires a reason before widening what counts as fatal", () => {
    expect(SCRIPT).toContain("Add a code here only with a reason beside it");
  });

  it("looks at every edge function, not a chosen few", () => {
    expect(SCRIPT).toContain('const ROOT = "supabase/functions"');
    expect(SCRIPT).toContain("walk(ROOT)");
  });

  it("runs in CI as its own job", () => {
    expect(WORKFLOW).toContain("edge-functions:");
    expect(WORKFLOW).toContain("node scripts/check-edge-functions.mjs");
  });
});
