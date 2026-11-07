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
  error: "no_tool_result",
  status: "error",
  note: "This tool call has no recorded result. It did not succeed. Do not treat it as completed and do not invent its outcome.",
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
    const repairedCalls = calls.map((call, index) => ({
      ...call,
      id: call.id || `tool-call-${i}-${index}`,
    }));
    out.push({ ...message, tool_calls: repairedCalls });
    const results: T[] = [];
    const between: T[] = [];
    let j = i + 1;
    while (j < messages.length && messages[j]?.role !== "assistant") {
      if (messages[j]?.role === "tool") results.push(messages[j]);
      else between.push(messages[j]);
      j++;
    }
    const byId = new Map(results.map((result) => [String(result.tool_call_id ?? ""), result]));
    for (const call of repairedCalls) {
      const existing = byId.get(call.id);
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
