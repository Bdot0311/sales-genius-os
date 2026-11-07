/**
 * Bedrock rejects a history where a tool_use is not followed by a tool_result
 * for that id. A missing result is an error state, not a success and not a
 * reason to drop the call.
 */

export interface SequencedMessage {
  role?: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
  [key: string]: unknown;
}

export const MISSING_TOOL_RESULT = {
  error: "unknown_outcome",
  status: "unknown",
  note: "No result was recorded for this tool call. The outcome is unknown. Do not treat it as success or failure, and do not run a send or a charge again unless a durable receipt says it did not start.",
};

export function repairToolSequence<T extends SequencedMessage>(messages: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const calls = message?.role === "assistant" ? message.tool_calls ?? [] : [];
    if (!calls.length) {
      out.push(message);
      continue;
    }
    const results: T[] = [];
    const between: T[] = [];
    let j = i + 1;
    while (j < messages.length && messages[j]?.role !== "assistant") {
      if (messages[j]?.role === "tool") results.push(messages[j]);
      else between.push(messages[j]);
      j++;
    }
    const unused = [...results];
    const repairedCalls = calls.map((call, index) => {
      if (call.id) return { ...call, id: call.id };
      const open = unused.findIndex((result) => !result.tool_call_id);
      const id = `tool-call-${i}-${index}`;
      if (open >= 0) unused[open] = { ...unused[open], tool_call_id: id };
      return { ...call, id };
    });
    out.push({ ...message, tool_calls: repairedCalls });
    const byId = new Map(unused.map((result) => [String(result.tool_call_id ?? ""), result]));
    for (const call of repairedCalls) {
      const existing = byId.get(call.id!);
      if (existing) out.push(existing);
      else {
        out.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(MISSING_TOOL_RESULT),
        } as T);
      }
    }
    out.push(...between);
    i = j - 1;
  }
  return out;
}
