/**
 * Keeping one turn's context from growing all the way to the ceiling.
 *
 * A turn is up to eight model steps, and every assistant message and every
 * tool result is pushed onto one array that nothing ever removes. History
 * loaded from the thread is bounded — HISTORY_TOKEN_BUDGET caps it at 12,000
 * tokens, newest first — but the turn's own working array has no equivalent,
 * so a turn that lists a hundred leads, researches six of them and drafts from
 * the result carries all of it into step seven.
 *
 * That costs twice. The provider is paid for the same hundred-lead payload on
 * every subsequent call, and each call gets slower, which on a function with a
 * 110-second ceiling is the difference between finishing and continuing into
 * another pass.
 *
 * It is also dead weight rather than context: the tools that act later read
 * their records back from the database by id — loadLead does this at five
 * separate call sites — so nothing downstream depends on the raw payload still
 * being in the conversation.
 *
 * ── Two deliberate departures from the obvious approach ──────────────────
 *
 * It prunes by SIZE AND AGE, not by a list of tool names. A curated list of
 * "high volume" tools is a list that stops covering the tools added after it
 * was written, silently, and this codebase is actively growing its tool set
 * from two directions. Size is self-maintaining: anything big and old enough
 * to matter gets pruned whatever it is called.
 *
 * And it rewrites content in place rather than dropping messages. The provider
 * requires exactly one tool message for every tool_call the assistant made; a
 * removed one is a malformed request, not a smaller one.
 */

export interface TurnMessage {
  role?: string;
  content?: unknown;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; function?: { name?: string } }>;
  [key: string]: unknown;
}

/*
 * The same heuristic the thread history already uses, so the two budgets are
 * measured in the same unit and can be reasoned about together.
 */
export const approxTokens = (text: string): number => Math.ceil(String(text ?? "").length / 4);

/**
 * When the working array is worth shrinking.
 *
 * Well above a normal turn: most resolve in one or two tool rounds and never
 * come near this. It is here for the turn that reads a hundred leads, which is
 * the one that otherwise slows down every step after it.
 */
export const TURN_CONTEXT_BUDGET = 60_000;

/**
 * Where the untouchable tail begins: the last step the model took.
 *
 * Counting back a fixed number of messages was the first attempt and it was
 * wrong. A turn that lists a hundred leads and then drafts is eight messages
 * long, so protecting the last six put the boundary before every tool result
 * and nothing was ever prunable — the exact turn this exists for would have
 * sailed past untouched.
 *
 * The model needs to see what just happened, which is precisely the assistant
 * message that made the current calls and the results that came back from it.
 * That is findable rather than guessable, and it holds whether the step made
 * one call or six.
 */
export function lastStepStart(messages: TurnMessage[]): number {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
    if (messages[i]?.role === "assistant" && (messages[i]?.tool_calls?.length ?? 0) > 0) return i;
  }
  return messages?.length ?? 0;
}

/** Below this a tool result is not worth the note that would replace it. */
export const PRUNE_RESULTS_OVER_CHARS = 1_200;

/** Marks a message this has already rewritten, so a later pass leaves it be. */
const PRUNED_MARKER = "__pruned_by_context_manager";

export function messagesTokens(messages: TurnMessage[]): number {
  let total = 0;
  for (const message of messages ?? []) {
    total += approxTokens(typeof message?.content === "string" ? message.content : JSON.stringify(message?.content ?? ""));
  }
  return total;
}

/**
 * Which tool produced each result, by call id.
 *
 * Tool messages carry only `role`, `tool_call_id` and `content` — the name
 * lives on the assistant message that asked for the call. Without this map a
 * pruned result cannot say what it was, which is the difference between a note
 * the model can reason about and a hole.
 */
export function toolNamesByCallId(messages: TurnMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages ?? []) {
    for (const call of message?.tool_calls ?? []) {
      const id = call?.id;
      const name = call?.function?.name;
      if (id && name) names.set(String(id), String(name));
    }
  }
  return names;
}

/** What replaces a payload the turn has finished with. */
export function prunedNotice(toolName: string, originalChars: number): string {
  return JSON.stringify({
    [PRUNED_MARKER]: true,
    tool: toolName || "unknown",
    note:
      `This result was removed from the conversation to keep the turn within its context budget. ` +
      `It ran successfully and whatever you took from it is in your own messages below. ` +
      `If you need these records again, call the tool again or read them by id — do not guess at what they contained.`,
    original_size_chars: originalChars,
  });
}

export interface PruneOutcome {
  tokensBefore: number;
  tokensAfter: number;
  prunedCount: number;
}

/**
 * Shrink the turn's working array, in place, to fit its budget.
 *
 * Oldest first, because the oldest payload is the one the model is least
 * likely to still be working from, and it stops the moment the array fits —
 * a turn that only slightly overruns loses only its single largest old result.
 *
 * Returns what it did rather than logging, so the caller decides whether that
 * is worth a line.
 */
export function pruneTurnContext(
  messages: TurnMessage[],
  options: { budget?: number; minChars?: number } = {},
): PruneOutcome {
  const budget = options.budget ?? TURN_CONTEXT_BUDGET;
  const minChars = options.minChars ?? PRUNE_RESULTS_OVER_CHARS;

  const tokensBefore = messagesTokens(messages);
  if (tokensBefore <= budget) {
    return { tokensBefore, tokensAfter: tokensBefore, prunedCount: 0 };
  }

  const names = toolNamesByCallId(messages);
  const boundary = lastStepStart(messages);
  let prunedCount = 0;
  let running = tokensBefore;

  for (let i = 0; i < boundary && running > budget; i++) {
    const message = messages[i];
    if (!message || message.role !== "tool") continue;

    const content = typeof message.content === "string" ? message.content : "";
    if (content.length <= minChars) continue;
    // Already rewritten by an earlier pass of this same turn.
    if (content.includes(PRUNED_MARKER)) continue;

    const replacement = prunedNotice(names.get(String(message.tool_call_id ?? "")) ?? "", content.length);
    running -= approxTokens(content) - approxTokens(replacement);
    message.content = replacement;
    prunedCount += 1;
  }

  return { tokensBefore, tokensAfter: messagesTokens(messages), prunedCount };
}
