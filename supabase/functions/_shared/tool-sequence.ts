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
    const calls = callsOf(message);
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
    out.push({ ...message, tool_calls: repairedCalls } as T);
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

function callsOf(message: SequencedMessage): Array<{ id?: string; function?: { name?: string; arguments?: string } }> {
  if (message?.tool_calls?.length) return message.tool_calls;
  if (!Array.isArray(message?.content)) return [];
  return message.content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const block = part as { type?: string; id?: string; name?: string; input?: unknown };
    if (block.type !== "tool_use") return [];
    return [{ id: block.id, function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } }];
  });
}

/** Mutating calls whose recorded result is unknown must not be run again. */
export function unknownMutationKeys(messages: SequencedMessage[], keyFor: (name: string, args: Record<string, unknown>) => string | null): string[] {
  const keys: string[] = [];
  const repaired = repairToolSequence(messages);
  for (let i = 0; i < repaired.length; i++) {
    const calls = repaired[i]?.tool_calls ?? [];
    if (!calls.length) continue;
    const results = repaired.slice(i + 1).filter((message) => message.role === "tool");
    for (const call of calls) {
      const result = results.find((message) => message.tool_call_id === call.id);
      const content = String(result?.content ?? "");
      if (!content.includes("unknown_outcome")) continue;
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(call.function?.arguments || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed;
      } catch { /* the key stays absent */ }
      const key = keyFor(String(call.function?.name ?? ""), args);
      if (key) keys.push(key);
    }
  }
  return keys;
}
