import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  PRUNE_RESULTS_OVER_CHARS,
  TURN_CONTEXT_BUDGET,
  lastStepStart,
  KEEP_IDS,
  idsIn,
  messagesTokens,
  prunedNotice,
  pruneTurnContext,
  toolNamesByCallId,
  type TurnMessage,
} from "../../supabase/functions/_shared/turn-context";

/**
 * One turn's working array grew and nothing ever shrank it.
 *
 * History loaded from the thread is capped at 12,000 tokens, newest first. The
 * turn's own array had no equivalent: every assistant message and every tool
 * result was pushed and never removed, so a turn that lists a hundred leads,
 * researches six and drafts from the result carries all of it into step seven.
 * The provider is paid for that payload on every subsequent call, and every
 * call is slower — which on a 110-second function is the difference between
 * finishing and spilling into another pass.
 */

const big = (n = PRUNE_RESULTS_OVER_CHARS + 500) => "x".repeat(n);

/**
 * A turn: a call, a fat result, then more of the same.
 *
 * Sized in characters against a budget counted in tokens, so the numbers here
 * are four times what they look like. 150,000 characters is ~37,500 tokens,
 * and two of them clear the 60,000 budget with one prune to spare — which is
 * what makes the oldest-first-and-stop behaviour observable.
 */
function turn(resultSize = 150_000): TurnMessage[] {
  return [
    { role: "system", content: "rules" },
    { role: "user", content: "draft for my best leads" },
    { role: "assistant", content: null, tool_calls: [{ id: "c1", function: { name: "list_leads" } }] },
    { role: "tool", tool_call_id: "c1", content: "L".repeat(resultSize) },
    { role: "assistant", content: null, tool_calls: [{ id: "c2", function: { name: "research_lead" } }] },
    { role: "tool", tool_call_id: "c2", content: "R".repeat(resultSize) },
    { role: "assistant", content: null, tool_calls: [{ id: "c3", function: { name: "draft_outreach" } }] },
    { role: "tool", tool_call_id: "c3", content: "D".repeat(400) },
  ];
}

describe("it leaves a turn that fits alone", () => {
  it("does nothing under budget", () => {
    const messages = turn(100);
    const before = JSON.stringify(messages);
    const out = pruneTurnContext(messages);
    expect(out.prunedCount).toBe(0);
    expect(JSON.stringify(messages)).toBe(before);
  });

  it("does not touch a small result even in an oversized turn", () => {
    // Replacing it costs nearly as much as it saves.
    const messages = turn();
    pruneTurnContext(messages);
    expect(messages[7].content).toBe("D".repeat(400));
  });
});

describe("it sheds what the turn has finished with", () => {
  it("shrinks an oversized turn", () => {
    const messages = turn();
    const out = pruneTurnContext(messages);
    expect(out.tokensBefore).toBeGreaterThan(TURN_CONTEXT_BUDGET);
    expect(out.tokensAfter).toBeLessThan(out.tokensBefore);
    expect(out.prunedCount).toBeGreaterThan(0);
  });

  it("says which tool the payload came from", () => {
    // Tool messages carry no name — it lives on the assistant message that
    // asked for the call, so a pruned note needs the id map to say anything.
    const messages = turn();
    pruneTurnContext(messages);
    expect(String(messages[3].content)).toContain("list_leads");
  });

  it("tells the model to fetch again rather than guess", () => {
    const messages = turn();
    pruneTurnContext(messages);
    expect(String(messages[3].content)).toContain("never invent one");
  });

  /*
   * An instruction not to hallucinate is not a mechanism.
   *
   * The note used to say "do not guess at what they contained" and that is
   * exactly what happened: after a resume, with the list_leads result rewritten
   * to a note, the model called draft_outreach with twelve lead ids belonging
   * to no account, then listed leads three more times trying to recover. One
   * request for forty-nine leads became four overlapping passes.
   *
   * Records are what cost context. Ids are what the turn still needs.
   */
  it("keeps the ids the result returned", () => {
    const ids = Array.from({ length: 5 }, (_, i) => `aaaaaaaa-bbbb-cccc-dddd-00000000000${i}`);
    const messages: TurnMessage[] = [
      { role: "user", content: "u".repeat(300_000) },
      { role: "assistant", content: null, tool_calls: [{ id: "c1", function: { name: "list_leads" } }] },
      { role: "tool", tool_call_id: "c1", content: JSON.stringify({ leads: ids.map((id) => ({ id, notes: "x".repeat(2000) })) }) },
      { role: "assistant", content: null, tool_calls: [{ id: "c2", function: { name: "draft_outreach" } }] },
      { role: "tool", tool_call_id: "c2", content: "ok" },
    ];
    pruneTurnContext(messages);
    const note = String(messages[2].content);
    expect(note).toContain("__pruned_by_context_manager");
    for (const id of ids) expect(note).toContain(id);
  });

  it("keeps the ids cheap — a bounded number of them, not the records", () => {
    const many = Array.from({ length: 400 }, (_, i) =>
      `aaaaaaaa-bbbb-cccc-dddd-${String(i).padStart(12, "0")}`);
    const payload = JSON.stringify(many.map((id) => ({ id, notes: "x".repeat(500) })));
    expect(idsIn(payload)).toHaveLength(KEEP_IDS);
    expect(prunedNotice("list_leads", payload.length, payload).length).toBeLessThan(payload.length / 4);
  });

  it("says nothing about ids when the payload had none", () => {
    expect(prunedNotice("get_metrics", 5000, "no identifiers here")).not.toContain('"ids"');
  });

  it("takes the oldest first and stops once it fits", () => {
    // A turn that only slightly overruns loses one old payload, not all of them.
    const messages = turn();
    const out = pruneTurnContext(messages);
    expect(out.prunedCount).toBe(1);
    expect(String(messages[3].content)).toContain("original_size_chars");
    expect(messages[5].content).toBe("R".repeat(150_000));
  });
});

describe("what it must never break", () => {
  /*
   * The provider requires exactly one tool message for every tool_call the
   * assistant made. A removed one is a malformed request, not a smaller one.
   */
  it("keeps every message and every tool_call_id", () => {
    const messages = turn();
    const idsBefore = messages.map((m) => m.tool_call_id ?? null);
    pruneTurnContext(messages);
    expect(messages).toHaveLength(8);
    expect(messages.map((m) => m.tool_call_id ?? null)).toEqual(idsBefore);
  });

  it("never rewrites the system or user message", () => {
    const messages = turn();
    pruneTurnContext(messages);
    expect(messages[0].content).toBe("rules");
    expect(messages[1].content).toBe("draft for my best leads");
  });

  it("never rewrites an assistant message, which carries the tool_calls", () => {
    const messages = turn();
    pruneTurnContext(messages);
    for (const m of messages.filter((x) => x.role === "assistant")) {
      expect(m.tool_calls).toBeDefined();
      expect(m.content).toBeNull();
    }
  });

  it("leaves the last step intact so the model sees what just happened", () => {
    // Counting back a fixed number of messages was the first attempt, and on
    // an eight-message turn it put the boundary before every tool result —
    // nothing was prunable and the pruner silently did nothing.
    const messages: TurnMessage[] = [];
    for (let i = 0; i < 12; i++) {
      messages.push({ role: "assistant", content: null, tool_calls: [{ id: `c${i}`, function: { name: "list_leads" } }] });
      messages.push({ role: "tool", tool_call_id: `c${i}`, content: big(30_000) });
    }
    pruneTurnContext(messages);
    for (const m of messages.slice(lastStepStart(messages))) {
      if (m.role === "tool") expect(String(m.content)).not.toContain("context budget");
    }
  });

  it("will not prune the live step even when that is the only thing left to cut", () => {
    /*
     * The earlier version of this test could not fail. Pruning stops the
     * moment the turn fits, so with several old payloads it never reached the
     * tail and the boundary was never exercised — removing the boundary
     * entirely still passed. This puts the only large result IN the live step
     * and pushes the turn over budget with something unprunable, so the
     * boundary is the only thing standing between the pruner and the result
     * the model is about to reason from.
     */
    const messages: TurnMessage[] = [
      { role: "system", content: "rules" },
      { role: "user", content: "u".repeat(300_000) },
      { role: "assistant", content: null, tool_calls: [{ id: "c1", function: { name: "list_leads" } }] },
      { role: "tool", tool_call_id: "c1", content: "L".repeat(50_000) },
    ];
    const out = pruneTurnContext(messages);
    expect(out.tokensBefore).toBeGreaterThan(TURN_CONTEXT_BUDGET);
    expect(out.prunedCount).toBe(0);
    expect(messages[3].content).toBe("L".repeat(50_000));
  });

  it("finds the last step however many calls it made", () => {
    const messages = turn();
    // The draft_outreach call at index 6 and its result are the live step.
    expect(lastStepStart(messages)).toBe(6);
  });

  it("does not prune the same result twice", () => {
    const messages = turn();
    pruneTurnContext(messages);
    const afterFirst = String(messages[3].content);
    const second = pruneTurnContext(messages);
    expect(String(messages[3].content)).toBe(afterFirst);
    expect(second.prunedCount).toBe(0);
  });
});

describe("reading the tool name off the call that asked for it", () => {
  it("maps ids to names", () => {
    const map = toolNamesByCallId(turn());
    expect(map.get("c1")).toBe("list_leads");
    expect(map.get("c3")).toBe("draft_outreach");
  });

  it("survives a message with no calls at all", () => {
    expect(toolNamesByCallId([{ role: "user", content: "hi" }]).size).toBe(0);
  });
});

describe("counting", () => {
  it("measures content whether it is a string or not", () => {
    expect(messagesTokens([{ role: "user", content: "abcd" }])).toBe(1);
    expect(messagesTokens([{ role: "tool", content: { a: 1 } }])).toBeGreaterThan(0);
  });
});

describe("the loop runs it before it pays to send", () => {
  const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
  const bare = AGENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("prunes immediately before the model call", () => {
    const prune = bare.indexOf("const pruned = pruneTurnContext(messages);");
    const call = bare.indexOf('res = await aiFetch("agent-chat"', prune);
    expect(prune).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(prune);
  });

  it("prunes in place, so a resume does not re-inflate the turn", () => {
    // The trace stores this same array as the resume point; the full result is
    // still in its own tool_results column for anyone reading back.
    expect(bare).toContain("pruneTurnContext(messages)");
    expect(bare).not.toContain("pruneTurnContext([...messages]");
  });
});
