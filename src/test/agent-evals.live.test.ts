import { describe, expect, it } from "vitest";
import {
  AGENT_SCENARIOS,
  explainResult,
  scoreScenario,
  type AgentScenario,
} from "../../supabase/functions/_shared/agent-scenarios";

/**
 * The scenarios, actually run.
 *
 * AGENT_SCENARIOS has been a well-formed list with a working grader and no
 * runner: the existing tests check the data is sane and that scoreScenario
 * judges a fixture correctly, which means every prompt change to this agent
 * has still been unverifiable. Every quality regression this month was found
 * by the person paying for it, in production, after the emails went out.
 *
 * This executes a scenario against a deployed agent and grades the real run
 * with the same pure function the fixtures use.
 *
 * ── It does not run by default, and it must not ──────────────────────────
 *
 * These scenarios call draft_outreach and enrich_leads for real, and the whole
 * point of the `forbid` list is to catch an agent that SENDS when it was told
 * not to. A suite that can send is a suite that can email real prospects from
 * a real domain. So it refuses to start against an account that has not been
 * declared disposable, and the refusal is deliberate rather than a config
 * oversight waiting to bite.
 *
 *   EVAL_AGENT_URL=https://<project>.supabase.co \
 *   EVAL_AGENT_JWT=<a user JWT for a THROWAWAY account> \
 *   EVAL_SUPABASE_ANON_KEY=<anon key> \
 *   EVAL_ACCOUNT_IS_DISPOSABLE=yes \
 *   npx vitest run src/test/agent-evals.live.test.ts
 */

const URL_ = process.env.EVAL_AGENT_URL;
const JWT = process.env.EVAL_AGENT_JWT;
const ANON = process.env.EVAL_SUPABASE_ANON_KEY;
const DISPOSABLE = process.env.EVAL_ACCOUNT_IS_DISPOSABLE === "yes";

const configured = Boolean(URL_ && JWT && ANON);
const live = configured && DISPOSABLE;

/** Only the roles a default account can run without extra agent builds. */
const RUNNABLE = AGENT_SCENARIOS.filter((s) => s.role === "full_cycle");

interface AgentReply {
  message?: { content?: string };
  toolEvents?: Array<{ name?: string }>;
}

async function createThread(mode: AgentScenario["mode"]): Promise<string> {
  const res = await fetch(`${URL_}/rest/v1/agent_chat_threads`, {
    method: "POST",
    headers: {
      apikey: ANON as string,
      Authorization: `Bearer ${JWT}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ title: "agent eval", autonomy: mode }),
  });
  if (!res.ok) throw new Error(`could not open a thread: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Array<{ id: string }>;
  const id = rows[0]?.id;
  if (!id) throw new Error("thread insert returned no id");
  return id;
}

async function sendTurn(threadId: string, message: string): Promise<AgentReply> {
  const res = await fetch(`${URL_}/functions/v1/agent-chat`, {
    method: "POST",
    headers: {
      apikey: ANON as string,
      Authorization: `Bearer ${JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ threadId, message, timezone: "UTC" }),
  });
  if (!res.ok) throw new Error(`turn failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as AgentReply;
}

/**
 * One scenario, start to finish.
 *
 * Prior turns run on the same thread and are not judged: the failures worth
 * catching happen in a conversation where the agent is already reasoning from
 * its own earlier summary, not on a clean first message.
 */
async function runScenario(scenario: AgentScenario) {
  const threadId = await createThread(scenario.mode);
  for (const prior of scenario.priorTurns ?? []) await sendTurn(threadId, prior);
  const reply = await sendTurn(threadId, scenario.message);
  const called = (reply.toolEvents ?? []).map((e) => String(e?.name ?? "")).filter(Boolean);
  return scoreScenario(scenario, called, String(reply.message?.content ?? ""));
}

describe("the eval harness is wired to something", () => {
  it("has scenarios a default account can run", () => {
    expect(RUNNABLE.length).toBeGreaterThan(0);
  });

  it("refuses a live run against an account not declared disposable", () => {
    // The guard is the point. A suite whose forbid list is "do not send" can
    // only prove anything by being allowed to send, so it must never be
    // pointed at an account whose domain matters.
    if (configured && !DISPOSABLE) {
      expect(live).toBe(false);
    }
    expect(typeof DISPOSABLE).toBe("boolean");
  });

  it.skipIf(live)("skips cleanly when it has no credentials", () => {
    // Green by default, so CI stays honest about what it did and did not run.
    expect(live).toBe(false);
  });
});

describe.skipIf(!live)("scenarios against a deployed agent", () => {
  for (const scenario of RUNNABLE) {
    it(
      `${scenario.id} — ${scenario.guards}`,
      async () => {
        const result = await runScenario(scenario);
        // explainResult names the forbidden tool that ran, or the work that
        // did not, which is what whoever reads the failure needs.
        expect(explainResult(scenario, result), explainResult(scenario, result)).toContain("pass");
        expect(result.violations).toEqual([]);
        expect(result.missedWork).toBe(false);
        if (scenario.expectSays) expect(result.saidExpected).toBe(true);
      },
      120_000,
    );
  }
});
