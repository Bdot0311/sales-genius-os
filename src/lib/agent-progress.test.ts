import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { labelForTool, TOOL_LABELS } from "../hooks/use-agent-run-steps";

const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
const CARD = readFileSync("src/components/agent/AgentWorkingIndicator.tsx", "utf8");
const HOOK = readFileSync("src/hooks/use-agent-run-steps.tsx", "utf8");

/**
 * The status card described a plausible turn rather than the one running. It
 * picked a checklist by regex on the user's message and advanced it with
 * `Math.floor(seconds / 4)`, so a ninety-second research pass showed
 * "Wrapping up" twenty seconds in, and a failed tool showed a green tick.
 */
describe("the agent reports the work it actually did", () => {
  it("writes each step when the tool returns, not after the turn", () => {
    expect(AGENT).toContain('.from("agent_step_metrics")');
    expect(AGENT).toContain("live step metric insert failed");
  });

  it("does not block the turn on a progress write", () => {
    // A status update must never slow down or fail the work it describes.
    expect(AGENT).toContain("void admin");
  });

  it("stops re-inserting the steps at the end of the turn", () => {
    // The final write is the turn summary only; batching them again would
    // double every row the Performance tab counts.
    expect(AGENT).not.toContain("...stepMetrics,\n        {");
  });
});

describe("the card prefers real steps", () => {
  it("renders what finished, with what it reported", () => {
    expect(CARD).toContain("steps.length > 0");
    expect(CARD).toContain("labelForTool(step.toolName)");
    expect(CARD).toContain("step.detail");
  });

  it("shows a failed step as failed", () => {
    expect(CARD).toContain('step.status === "error"');
    expect(CARD).toContain("AlertTriangle");
  });

  it("no longer advances a fake checklist on a timer", () => {
    expect(CARD).not.toContain("Math.floor(seconds / 4)");
  });

  it("moves the progress bar on completed steps", () => {
    expect(CARD).toContain("steps.length * 18");
  });
});

describe("tool labels", () => {
  it("names the tools a user is most likely to see", () => {
    for (const tool of ["research_leads", "draft_outreach", "send_drafts", "resolve_approvals"]) {
      expect(TOOL_LABELS[tool], tool).toBeTruthy();
    }
  });

  it("falls back to the tool's own name rather than inventing one", () => {
    expect(labelForTool("some_new_tool")).toBe("some new tool");
  });

  it("reads only this run's rows", () => {
    expect(HOOK).toContain('.eq("thread_id", threadId)');
    expect(HOOK).toContain('.gte("created_at", since)');
    expect(HOOK).toContain('.neq("tool_name", "__turn__")');
  });
});
