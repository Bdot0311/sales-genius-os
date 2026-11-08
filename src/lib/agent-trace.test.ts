import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_MESSAGES_BYTES,
  MAX_RESULT_CHARS,
  mergeCompleted,
  messagesFitInTrace,
  resultOk,
  resumeFrom,
  trimResult,
} from "../../supabase/functions/_shared/agent-trace";

/**
 * A turn is up to eight model steps and none of them were written down.
 *
 * agent_chat_threads knew a run was "running" and agent_chat_messages held
 * what the user sees; between them there was nothing. So a turn that died lost
 * every search, enrichment and draft it had already paid for; a fault could
 * only be diagnosed from screenshots, because no other evidence survived; and
 * the guard against repeating a mutation was a Set in memory, which is exactly
 * right for one request and worth nothing across the restart that causes a
 * resume.
 */

describe("where a turn picks up", () => {
  it("continues from the step after the last one stored", () => {
    const r = resumeFrom({ step_index: 3, messages: [{ role: "user" }] }, 8);
    expect(r).toEqual({ messages: [{ role: "user" }], nextStep: 4 });
  });

  it("starts fresh when nothing was stored", () => {
    expect(resumeFrom(null, 8)).toBeNull();
  });

  /*
   * Restarting costs work. Resuming into a half-remembered conversation costs
   * a turn that behaves strangely and cannot be explained afterwards, so every
   * doubtful case starts over.
   */
  it("starts fresh rather than resume into nothing", () => {
    expect(resumeFrom({ step_index: 2, messages: [] }, 8)).toBeNull();
    expect(resumeFrom({ step_index: 2, messages: "not an array" }, 8)).toBeNull();
    expect(resumeFrom({ step_index: 2, messages: null }, 8)).toBeNull();
  });

  it("starts fresh on a step index that cannot be real", () => {
    expect(resumeFrom({ step_index: -1, messages: [{}] }, 8)).toBeNull();
    expect(resumeFrom({ step_index: 1.5, messages: [{}] }, 8)).toBeNull();
  });

  it("does not resume a turn that already spent its budget", () => {
    // Step 7 of 8 is the last one; there is nothing after it to resume into.
    expect(resumeFrom({ step_index: 7, messages: [{}] }, 8)).toBeNull();
    expect(resumeFrom({ step_index: 9, messages: [{}] }, 8)).toBeNull();
    expect(resumeFrom({ step_index: 6, messages: [{}] }, 8)?.nextStep).toBe(7);
  });
});

describe("what gets stored, and what is too big to", () => {
  it("truncates a tool result and says it did", () => {
    const long = "x".repeat(MAX_RESULT_CHARS + 500);
    const r = trimResult("list_leads", true, long);
    expect(r.detail.length).toBeLessThan(long.length);
    expect(r.detail).toContain("chars)");
  });

  it("leaves a short result alone", () => {
    expect(trimResult("list_leads", true, "12 leads").detail).toBe("12 leads");
  });

  it("serialises a result that is not a string", () => {
    expect(trimResult("x", true, { count: 2 }).detail).toBe('{"count":2}');
  });

  /*
   * The message array is the resume, so truncating it would mean resuming into
   * a conversation the model half-remembers. It is stored whole or not at all,
   * and a turn too large simply gets no resume point.
   */
  it("refuses to store a working state too large to be worth it", () => {
    expect(messagesFitInTrace([{ role: "user", content: "hi" }])).toBe(true);
    expect(messagesFitInTrace([{ content: "x".repeat(MAX_MESSAGES_BYTES + 1) }])).toBe(false);
  });

  it("refuses one it cannot serialise at all", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(messagesFitInTrace([circular])).toBe(false);
  });
});

describe("whether a tool reply was a success", () => {
  it("reads the error key every refusal in this codebase carries", () => {
    expect(resultOk(JSON.stringify({ error: "out_of_scope" }))).toBe(false);
    expect(resultOk(JSON.stringify({ error: "invalid_arguments" }))).toBe(false);
    expect(resultOk(JSON.stringify({ leads: [] }))).toBe(true);
  });

  it("does not invent a fault from something it cannot parse", () => {
    // The detail is stored beside this either way; guessing failure would put
    // red marks on a trace for no reason.
    expect(resultOk("not json at all")).toBe(true);
  });

  it("counts a missing reply as a failure, because the tool produced nothing", () => {
    expect(resultOk(null)).toBe(false);
    expect(resultOk(undefined)).toBe(false);
  });
});

describe("what the turn believes it has already done", () => {
  it("takes the union of the client's list and what actually completed", () => {
    // Neither survives everything alone: the client's list outlives a worker
    // restart, the stored one outlives a client that never came back.
    const merged = mergeCompleted(["send:a"], ["send:b"]);
    expect([...merged].sort()).toEqual(["send:a", "send:b"]);
  });

  it("ignores junk in the client's list", () => {
    const merged = mergeCompleted([1, null, "", "send:a"], []);
    expect([...merged]).toEqual(["send:a"]);
  });

  it("survives a client that sent no list at all", () => {
    expect([...mergeCompleted(undefined, ["send:a"])]).toEqual(["send:a"]);
  });
});

/**
 * Wiring. The record is worth nothing if the turn does not write it.
 */
describe("the turn records itself", () => {
  const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
  const bare = AGENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("resumes before the loop starts, not inside it", () => {
    const resume = bare.indexOf("const resumed = resumeFrom(await trace.latestStep(");
    const loop = bare.indexOf("for (let step = resumeAt; step < MAX_TURN_STEPS; step++)");
    expect(resume).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(resume);
  });

  it("uses one number for the loop ceiling and the resume guard", () => {
    // Two copies of 8 would drift, and a resume past the ceiling is a turn
    // that does nothing and reports success.
    expect(bare).toContain("const MAX_TURN_STEPS = 8;");
    expect(bare).toContain("resumeFrom(await trace.latestStep(threadId, runPass), MAX_TURN_STEPS)");
    expect(bare).not.toMatch(/for \(let step = \d+; step < 8;/);
  });

  it("writes the step where the tool replies rejoin the working array", () => {
    expect(bare).toContain("await trace.saveStep({");
    expect(bare).toContain("stepIndex: step,");
    const save = bare.indexOf("await trace.saveStep({");
    const breakOnCancel = bare.indexOf("if (cancelled) break;", save);
    expect(breakOnCancel).toBeGreaterThan(save);
  });

  it("never lets the record take the turn down with it", () => {
    // The user's work is the email, not the record of how it was made.
    const save = bare.indexOf("await trace.saveStep({");
    expect(bare.slice(Math.max(0, save - 200), save)).toContain("try {");
  });

  it("records a completed mutation on disk beside the in-memory set", () => {
    expect(bare).toContain("completedMutationKeys.add(mutationKey);");
    expect(bare).toContain("await trace.saveMutation(threadId, userId, mutationKey, toolName)");
  });

  it("clears them when the turn ends, in the one place that ends it", () => {
    expect(bare).toContain("await supabaseTraceStore(admin).clearMutations(threadId);");
    // The two later idles were the same statement written out again.
    expect((bare.match(/run_status: "idle", run_pass: 0/g) ?? []).length).toBe(1);
  });
});

describe("the tables are the worker's to write", () => {
  const SQL = readFileSync("supabase/migrations/20261008070000_agent_run_steps.sql", "utf8");

  it("lets a user read their own steps", () => {
    expect(SQL).toContain('CREATE POLICY "Users can view their own agent run steps"');
    expect(SQL).toContain("USING (auth.uid() = user_id)");
  });

  /*
   * A client that could forge a step could forge a resume, and a resume
   * decides what the agent believes it has already done — including which
   * sends already went.
   */
  it("gives no client any way to write one", () => {
    expect(SQL).not.toMatch(/FOR INSERT TO authenticated/);
    expect(SQL).not.toMatch(/FOR UPDATE TO authenticated/);
    expect(SQL).toContain("GRANT SELECT ON public.agent_run_steps TO authenticated;");
    expect(SQL).toContain("GRANT ALL ON public.agent_run_steps TO service_role;");
  });

  it("keeps one row per step of a pass, so a retry overwrites", () => {
    expect(SQL).toContain("UNIQUE (thread_id, run_pass, step_index)");
  });

  it("scopes a completed mutation to the thread, not the pass", () => {
    // A resume is the same turn as far as the user is concerned.
    expect(SQL).toContain("PRIMARY KEY (thread_id, mutation_key)");
  });
});
