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
    // The enqueue takes it as an argument now; the read is what matters, not
    // the shape of it. This is the regression that deployed green and threw on
    // every batch over twelve, so it stays pinned to the first read of all.
    const used = tool.search(/\bfeedback \|\| null\b/);
    expect(declared).toBeGreaterThan(-1);
    expect(used).toBeGreaterThan(-1);
    expect(declared).toBeLessThan(used);
  });

  it("still queues before the inline drafts run", () => {
    // Moving the block must not lose why it was early: a turn that dies
    // part-way through drafting has to keep the batch.
    const tool = AGENT.slice(AGENT.indexOf('case "draft_outreach"'), AGENT.indexOf('case "draft_sequence"'));
    const drafting = tool.search(/await mapLimit\(ids, \w+, genOne\)/);
    expect(drafting).toBeGreaterThan(-1);
    expect(tool.indexOf('.from("agent_jobs")')).toBeLessThan(drafting);
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
/**
 * The first complete Deno check of the edge functions found three errors, all
 * the same one: @types/web-push declares no default export, and three files
 * imported it as a default. Three errors across 255 files, one cause.
 */
describe("web-push is imported as the types declare it", () => {
  const PUSH_FILES = [
    "supabase/functions/_shared/notify-push.ts",
    "supabase/functions/send-push-notification/index.ts",
    "supabase/functions/run-seo-audit/index.ts",
  ];

  it("takes the namespace, with a default fallback", () => {
    for (const file of PUSH_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/^import webpush from/m);
      expect(src, file).toContain("import * as webpushModule");
      // Whichever esm.sh actually provides is the module, so the object at
      // runtime is the one a default import resolved to. This is the live push
      // path and it had just been made to work.
      expect(src, file).toContain(".default ?? webpushModule");
    }
  });

  it("leaves every call site untouched", () => {
    for (const file of PUSH_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toMatch(/webpush\.setVapidDetails\(/);
      expect(src, file).toMatch(/webpush\.sendNotification\(/);
    }
  });
});

describe("the report that measures what the partial check misses", () => {
  const REPORT = readFileSync("scripts/report-deno-check.mjs", "utf8");

  it("blocks, now that the cleanup turned out to be three lines", () => {
    // It ran report-only first so the size of the cleanup decided whether it
    // blocks, rather than the other way round. The answer was three errors with
    // one cause, so there was nothing to weigh.
    expect(WORKFLOW).toContain("edge-functions-deno:");
    const job = WORKFLOW.slice(WORKFLOW.indexOf("edge-functions-deno:"));
    expect(job.slice(0, job.indexOf("steps:"))).not.toContain("continue-on-error");
    expect(REPORT).toContain("process.exit(1)");
  });

  it("treats checking nothing as a failure, not a pass", () => {
    // Three runs of this reported no errors while checking no files. A green
    // tick for 255 unchecked files is the worst output it could produce.
    const empty = REPORT.slice(REPORT.indexOf("const trimmed = out.trim()"));
    expect(empty).toContain("which is a failure rather than a pass");
    expect(empty.indexOf("process.exit(1)")).toBeLessThan(empty.indexOf('"✓ No type errors."'));
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
    expect(REPORT).toContain("without reporting type errors");
    // The first run proved why: Deno spent the whole step installing
    // package.json and checked nothing, and a zero there would have read as a
    // clean bill of health for 255 unchecked files.
    expect(REPORT).toContain("A wall of registry downloads");
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

  it("strips the colour codes before parsing", () => {
    // Deno wraps the code as "\u001b[1mTS1192 \u001b[0m[ERROR]". The escape
    // sequence ends in a word character, so \bTS\d+\b had no boundary and a
    // run that found three real errors reported none of them.
    expect(REPORT).toContain("stripAnsi");
    expect(REPORT).toContain("stripAnsi(out)");
  });

  it("honours deno.json's exclusions", () => {
    // supabase/functions/mcp/index.ts is excluded there for a reason.
    expect(REPORT).toContain("denoConfig.exclude");
  });
});
