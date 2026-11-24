/**
 * An OpenAI-shaped completion re-emitted as server-sent events.
 *
 * A provider that cannot stream, or whose stream failed, still has to answer a
 * caller that asked for `stream: true`. Buffering the completion and emitting
 * it as one burst of SSE keeps the caller's parser unchanged: it is not
 * token-by-token, but it is the same wire format and the same final text.
 *
 * Lifted out of bedrock.ts so a second provider does not need a second copy.
 * The shape is the provider-neutral chat-completions object, so nothing here
 * knows which provider produced it.
 */
export function completionAsStream(completion: Record<string, unknown>): Response {
  const choices = Array.isArray(completion.choices) ? completion.choices as Record<string, unknown>[] : [];
  const choice = choices[0] ?? {};
  const message = (choice.message ?? {}) as Record<string, unknown>;

  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id: completion.id,
      object: "chat.completion.chunk",
      created: completion.created,
      model: completion.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;

  const body = [
    chunk({ role: "assistant" }, null),
    ...(message.content ? [chunk({ content: message.content }, null)] : []),
    ...(message.tool_calls
      ? [chunk({ tool_calls: (message.tool_calls as unknown[]).map((c, i) => ({ index: i, ...(c as object) })) }, null)]
      : []),
    chunk({}, String(choice.finish_reason ?? "stop")),
    `data: ${JSON.stringify({ usage: completion.usage })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
