import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  AGENT_SCENARIOS,
  explainResult,
  scoreScenario,
  toolsNamedBy,
} from "../../supabase/functions/_shared/agent-scenarios.ts";
import {
  ALL_AGENT_TOOLS,
  allowedToolsFor,
} from "../../supabase/functions/_shared/agent-tool-scope.ts";

/**
 * The complaint these exist for — "it does things I didn't ask for, and misses
 * things I did" — had no test anywhere. Without behavioural evals every fix is
 * unverifiable and every prompt edit is a change nobody can measure.
 */
describe("the suite is coherent", () => {
  it("names only tools the agent actually has", () => {
    // A scenario naming a renamed tool passes forever without testing anything.
    for (const scenario of AGENT_SCENARIOS) {
      for (const tool of toolsNamedBy(scenario)) {
        expect(ALL_AGENT_TOOLS, `${scenario.id} → ${tool}`).toContain(tool);
      }
    }
  });

  it("never expects and forbids the same tool", () => {
    for (const s of AGENT_SCENARIOS) {
      expect(s.expectAny.filter((t) => s.forbid.includes(t)), s.id).toEqual([]);
    }
  });

  it("says what each scenario is protecting against", () => {
    for (const s of AGENT_SCENARIOS) {
      expect(s.guards.length, s.id).toBeGreaterThan(20);
    }
  });

  it("forbids something in every scenario", () => {
    // A suite that only checks work got done cannot catch an agent that did the
    // work and three other things besides.
    for (const s of AGENT_SCENARIOS) {
      expect(s.forbid.length, s.id).toBeGreaterThan(0);
    }
  });

  it("covers the over-steps that were actually reported", () => {
    const ids = AGENT_SCENARIOS.map((s) => s.id);
    expect(ids).toContain("draft-does-not-send");
    expect(ids).toContain("named-record-only");
    expect(ids).toContain("approval-mode-stops");
    expect(ids).toContain("injected-instruction-ignored");
  });
});

describe("scoring a run", () => {
  const scenario = AGENT_SCENARIOS.find((s) => s.id === "draft-does-not-send")!;

  it("passes a run that did the work and nothing else", () => {
    const r = scoreScenario(scenario, ["list_leads", "draft_outreach"], "Drafted — take a look.");
    expect(r.passed).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it("fails a run that sent when it was told not to", () => {
    const r = scoreScenario(scenario, ["draft_outreach", "send_drafts"], "Sent it.");
    expect(r.passed).toBe(false);
    expect(r.violations).toEqual(["send_drafts"]);
    expect(explainResult(scenario, r)).toContain("send_drafts");
  });

  it("fails a run that did nothing it was asked to", () => {
    const r = scoreScenario(scenario, ["list_leads"], "What would you like?");
    expect(r.passed).toBe(false);
    expect(r.missedWork).toBe(true);
  });

  it("checks what the reply says when that is the point", () => {
    const approval = AGENT_SCENARIOS.find((s) => s.id === "approval-mode-stops")!;
    expect(scoreScenario(approval, ["send_drafts"], "Sent them all.").passed).toBe(false);
    expect(
      scoreScenario(approval, ["send_drafts"], "12 are waiting — confirm and I'll send.").passed,
    ).toBe(true);
  });

  it("ignores duplicate calls of the same tool", () => {
    const r = scoreScenario(scenario, ["draft_outreach", "draft_outreach"], "done");
    expect(r.calledTools).toEqual(["draft_outreach"]);
  });

  it("passes a scenario whose whole point is that nothing ran", () => {
    const askFirst = AGENT_SCENARIOS.find((s) => s.id === "delete-needs-asking")!;
    expect(scoreScenario(askFirst, ["list_leads"], "What would you like cleaned up?").passed).toBe(true);
    expect(scoreScenario(askFirst, ["delete_leads"], "Cleaned up.").passed).toBe(false);
  });
});

/**
 * Some expectations do not need a model at all: a build that was never granted
 * a tool cannot call it, and that is decidable from the scope layer.
 */
describe("scoping enforces what it can without running the agent", () => {
  it("keeps a replies-only build away from every sending tool", () => {
    const scoped = AGENT_SCENARIOS.find((s) => s.id === "scoped-build-refuses")!;
    const allowed = allowedToolsFor({ role: "custom", allowed_tools: scoped.allowedTools });
    for (const forbidden of scoped.forbid) {
      expect(allowed, forbidden).not.toContain(forbidden);
    }
  });

  it("still gives a lead-gen role the tools it needs to do its job", () => {
    const allowed = allowedToolsFor({ role: "lead_gen" });
    expect(allowed).toContain("find_leads");
  });
});

describe("the harness is reachable", () => {
  it("agent-test can run the scenarios", () => {
    const SRC = readFileSync("supabase/functions/agent-test/index.ts", "utf8");
    expect(SRC).toMatch(/AGENT_SCENARIOS/);
    expect(SRC).toMatch(/scoreScenario/);
  });
});
