import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { describeWork, labelForKind } from "../hooks/use-background-work";

const HOOK = readFileSync("src/hooks/use-background-work.tsx", "utf8");
const BAR = readFileSync("src/components/dashboard/BackgroundWorkBar.tsx", "utf8");
const LAYOUT = readFileSync("src/components/dashboard/DashboardLayout.tsx", "utf8");

const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const job = (kind: string, total: number, done = 0, failed = 0) =>
  ({ id: "x", kind, status: "running" as const, total, done, failed, created_at: "", request_text: null });

/**
 * "Searching for leads and go to saved leads, in the meantime it continues to
 * search. When you get back to search you're in Outreach building an email,
 * then want to go to AI agent, in the meantime still working."
 *
 * Most of it already continued — nothing in the app aborts a request and the
 * query client is made once for the whole tree. What was lost was the page's
 * knowledge, because progress lived in a useState inside a component that
 * unmounted. So this reads the jobs table instead of remembering.
 */
describe("what is still running, summarised", () => {
  it("says nothing when nothing is open", () => {
    expect(describeWork([])).toBeNull();
  });

  it("counts failures as finished, not as still pending", () => {
    // Otherwise a batch that failed half its items reads as permanently stuck.
    expect(describeWork([job("draft", 103, 24, 48)])).toBe("72 of 103 drafts");
  });

  it("sums several jobs of the same kind", () => {
    // One job per turn is the rule, but a second message while the first
    // drains makes two, and the user is owed the total.
    expect(describeWork([job("draft", 10, 3), job("draft", 6, 6)])).toBe("9 of 16 drafts");
  });

  it("names every kind running, not just the first", () => {
    expect(describeWork([job("draft", 10, 3), job("enrich", 5, 5)]))
      .toBe("3 of 10 drafts, 5 of 5 leads to enrich");
  });

  it("reads correctly for one", () => {
    expect(describeWork([job("enrich", 1, 0)])).toBe("0 of 1 lead to enrich");
  });

  it("handles a job whose total is not known yet", () => {
    expect(describeWork([job("search", 0, 0)])).toBe("search starting");
  });

  it("never renders a bare count for an unknown kind", () => {
    expect(labelForKind("something-new", 3)).toBe("items");
    expect(labelForKind("something-new", 1)).toBe("item");
  });
});

describe("it lives in the shell, which is the whole point", () => {
  it("is mounted in the layout, not on a page", () => {
    // A per-page indicator unmounts with the page, which is how this got lost.
    expect(code(LAYOUT)).toContain("<BackgroundWorkBar />");
    expect(code(LAYOUT)).toContain('import { BackgroundWorkBar } from "@/components/dashboard/BackgroundWorkBar";');
  });

  it("renders nothing when there is nothing to say", () => {
    // A permanent strip reading "idle" trains people to stop looking at it.
    expect(code(BAR)).toContain("if (!summary || jobs.length === 0) return null;");
  });

  it("names the work rather than just spinning", () => {
    expect(BAR).toContain("Still working — {summary}");
    expect(code(BAR)).toContain('role="status"');
    expect(code(BAR)).toContain('aria-live="polite"');
  });

  it("surfaces failures instead of counting them as progress", () => {
    expect(code(BAR)).toContain("jobs.reduce((n, j) => n + (j.failed ?? 0), 0)");
    // Matched on the rule rather than the sentence: the bar now names the
    // reasons beside the count, and pinning the old literal broke on the very
    // change that made the count useful.
    expect(code(BAR)).toContain("{failed} failed");
    expect(code(BAR)).toContain("describeFailures(failures)");
  });
});

describe("the hook reads state rather than remembering it", () => {
  it("asks the table for this user's open work", () => {
    expect(code(HOOK)).toContain('.from("agent_jobs" as any)');
    expect(code(HOOK)).toContain('.in("status", ["queued", "running"])');
    expect(code(HOOK)).toContain('.eq("user_id", auth.user.id)');
  });

  it("is account-wide, not scoped to one chat thread", () => {
    // useAgentJob answers the narrower question and stays as it is.
    expect(code(HOOK)).not.toContain('eq("thread_id"');
  });

  it("stops polling a hidden tab and catches up when it returns", () => {
    expect(code(HOOK)).toContain("if (typeof document !== \"undefined\" && document.hidden) return;");
    expect(code(HOOK)).toContain('document.addEventListener("visibilitychange", onVisible);');
    expect(code(HOOK)).toContain('document.removeEventListener("visibilitychange", onVisible);');
  });
});


/**
 * The shell said:
 *
 *   Still working — 35 of 106 drafts.
 *   4 failed — 2 scorer didn't respond, 2 AI rate limited, 1 invented a
 *   figure it can't back, 1 research found nothing usable to quote, 1 a
 *   research provider is not configured.
 *
 * Seven causes under a total of four.
 *
 * Neither number was wrong about its own source. `agent_jobs.failed` is
 * recomputed by the worker at the END of a pass -- process-agent-jobs counts
 * the item rows and writes the total -- while the item rows themselves are
 * written as each one settles. Mid-pass the rows are ahead of the counter,
 * and the bar took its total from the counter and its breakdown from the
 * rows.
 */
describe("the failure total and the reasons beside it agree", () => {
  it("counts the same rows the breakdown is built from", () => {
    expect(code(HOOK)).toContain('.select("error", { count: "exact" })');
    expect(code(HOOK)).toContain("setFailedCount(count ?? errors.length)");
    expect(code(HOOK)).toContain("setFailures(summariseFailures(errors))");
  });

  it("hands that total to the bar instead of re-summing the job counters", () => {
    expect(code(BAR)).toContain("failedCount");
    expect(code(BAR)).toContain("failures.length > 0");
    // The job counters remain the only number available before the first
    // breakdown lands, so the fallback stays.
    expect(code(BAR)).toContain("jobs.reduce((n, j) => n + (j.failed ?? 0), 0)");
  });

  it("stays exact when the breakdown sample is capped", () => {
    /*
     * The sample is limited to 500 error strings. `count: "exact"` is the
     * whole set, so a job with more failures than that still reports its
     * real total rather than 500.
     */
    expect(code(HOOK)).toContain(".limit(500)");
    expect(code(HOOK)).not.toContain("setFailedCount(errors.length)");
  });

  it("clears the total with the breakdown", () => {
    // Otherwise a finished run leaves its last count on screen.
    const hook = code(HOOK);
    const clears = hook.split("setFailures([]);").length - 1;
    const resets = hook.split("setFailedCount(0);").length - 1;
    expect(clears).toBeGreaterThan(0);
    expect(resets).toBe(clears);
  });
});
