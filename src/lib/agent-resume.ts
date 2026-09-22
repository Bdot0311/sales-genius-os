/**
 * Picking a long run back up without retyping the job.
 *
 * A request may chain six passes before agent-chat stops, and a 79-lead batch
 * needs more than that. PR #254 made the stop honest — the turn now says it has
 * stopped instead of claiming it is still going. This is the other half: the
 * user should not have to remember and retype the job to continue it.
 *
 * The marker is one sentence, written by the edge function and recognised here.
 * Two copies of a string drift, so `agent-resume.test.ts` reads the function's
 * source and asserts they are still the same sentence.
 */

/** The last sentence agent-chat appends when a run stops short of finishing. */
export const STOPPED_SHORT_MARKER =
  "Tell me to keep going and I'll pick up from exactly here.";

/**
 * What tapping the button sends.
 *
 * Written the way a careful person would type it: continue, and do not repeat
 * anything already done. The agent reads the thread above, so naming the work
 * again would only give it a second chance to misread it.
 */
export const RESUME_MESSAGE =
  "Keep going from exactly where you stopped. Everything above is already done — " +
  "do not repeat any of it, and pick up with what is left.";

/**
 * Whether the conversation is sitting on a run that stopped short.
 *
 * Read from the last assistant message rather than held only in memory, so the
 * button survives a reload, a second tab, and coming back to the thread later.
 */
export const canResume = (
  messages: { role: string; content: string | null }[],
): boolean => {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  return Boolean(last?.content?.includes(STOPPED_SHORT_MARKER));
};
