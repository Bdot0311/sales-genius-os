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

/**
 * The partial check cannot see anything that depends on a remote module's real
 * types, which is most of the code. Deno can. Before that becomes a blocking
 * job, the number it would block on has to be known.
 */
describe("the report that measures what the partial check misses", () => {
  const REPORT = readFileSync("scripts/report-deno-check.mjs", "utf8");

  it("never fails the build", () => {
    // Turning CI red before anyone has read the counts would decide the size of
    // the cleanup by accident.
    expect(WORKFLOW).toContain("edge-functions-deno-report:");
    const job = WORKFLOW.slice(WORKFLOW.indexOf("edge-functions-deno-report:"));
    expect(job.slice(0, job.indexOf("steps:"))).toContain("continue-on-error: true");
    expect(REPORT).not.toContain("process.exit(1)");
  });

  it("uses a Deno that can fetch the imports", () => {
    expect(WORKFLOW).toContain("denoland/setup-deno");
    expect(REPORT).toContain('execFileSync("deno", ["check"');
  });

  it("groups the count by kind and by file, rather than dumping errors", () => {
    // A wall of 133 lines is not a decision; "how many, of what kind" is.
    expect(REPORT).toContain("by kind — biggest first");
    expect(REPORT).toContain("The ten carrying most");
  });

  it("does not report a reassuring zero when Deno failed early", () => {
    expect(REPORT).toContain("No TS error codes parsed");
    // The first run proved why: Deno spent the whole step installing
    // package.json and checked nothing, and a zero there would have read as a
    // clean bill of health for 255 unchecked files.
    expect(REPORT).toContain("without reporting type errors");
  });

  it("shows the end of the output, not the start", () => {
    // Deno prints a download line per dependency before it reports anything,
    // so the head is always a wall of URLs and the reason it stopped is last.
    // Printing the first forty lines told me nothing, twice.
    expect(REPORT).toContain("lines.slice(-30)");
    expect(REPORT).toContain("Error lines:");
    expect(REPORT).toContain("Deno exited");
  });

  it("does not let Deno install the app's dependency tree", () => {
    // deno.json sets nodeModulesDir "auto" for the app. Without this flag
    // `deno check` reads package.json and installs Radix, Sentry, Stripe and
    // TanStack — none of which any edge function imports — before checking a
    // single line. The seven files using npm: specifiers pin their own
    // versions and need no node_modules directory.
    expect(REPORT).toContain("--node-modules-dir=none");
  });

  it("says so plainly when Deno is not installed", () => {
    // Which is the case in the sandbox this was written in.
    expect(REPORT).toContain('err.code === "ENOENT"');
  });

  it("honours deno.json's exclusions", () => {
    // supabase/functions/mcp/index.ts is excluded there for a reason.
    expect(REPORT).toContain("denoConfig.exclude");
  });
});
