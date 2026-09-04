/**
 * Reading the user's own "yes" instead of trusting the model to relay it.
 *
 * Retiring the approval queue left sending gated on a flag the model sets when
 * it believes the user has agreed. That is a two-step protocol carried out by
 * the least reliable component in the system, and when it does not perform it,
 * nothing ever sends: the tool reports a pending send, the model summarises it,
 * the user says yes, the model calls the tool again without the flag, and the
 * loop repeats forever. Users saw the agent invent reasons for the non-send —
 * "the drafts are duplicates" — because the tool's own note was the only
 * material it had to explain itself with.
 *
 * The permission comes from a person, so it is read from what the person wrote.
 *
 * Two conditions, both required. An affirmative on its own is not consent to
 * send: "yes, that one looks right" is agreement about a draft, not permission
 * to mail 21 people. It only counts when the turn immediately before it was
 * one that asked.
 */

export interface HistoryTurn {
  role: string;
  content: string;
  tool_events?: unknown;
}

/**
 * Plain agreement, and nothing more elaborate.
 *
 * Deliberately narrow: this authorises real email to real prospects, so an
 * ambiguous sentence has to fall through to the model asking again. "Sure, but
 * change the subject first" must not match, which is why anything carrying a
 * qualifier is excluded rather than searched for a "yes" inside it.
 */
const AFFIRMATIVE =
  /^\s*(?:yes|yep|yeah|yup|ok|okay|k|sure|confirmed?|confirm|approved?|approve(?:\s+all)?|do it|go|go ahead|send|send it|send them|send them all|send all|send now|please do|go for it|proceed|ship it|fire away|all good|looks good|lgtm|that's fine|thats fine)\b[\s.!,]*$/i;

/** Words that turn an apparent yes into a condition or a question. */
const QUALIFIER = /\b(?:but|except|however|instead|first|before|after|unless|if|only|wait|hold|don'?t|not|no)\b|\?/i;

export function isAffirmative(message: string): boolean {
  const text = (message ?? "").trim();
  if (!text || text.length > 120) return false;
  if (QUALIFIER.test(text)) return false;
  return AFFIRMATIVE.test(text);
}

/**
 * Whether the previous assistant turn was one that asked.
 *
 * Read from the tool events rather than the prose: the events record that a
 * send tool ran and returned without sending, which is a fact, where the
 * summary is the model's account of it.
 */
export function awaitedConfirmation(history: HistoryTurn[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn.role !== "assistant") continue;
    const events = Array.isArray(turn.tool_events)
      ? (turn.tool_events as { name?: string; status?: string; label?: string }[])
      : [];
    // Only the most recent assistant turn counts. An older pending send is a
    // different batch, and agreement does not reach backwards.
    return events.some(
      (e) =>
        e.status === "queued" &&
        ["send_drafts", "send_outreach", "schedule_drafts", "enroll_lead_in_sequence", "run_full_agent"]
          .includes(e.name ?? ""),
    );
  }
  return false;
}

/**
 * True when this turn carries the user's permission for the pending send.
 *
 * Never a substitute for the model's own `confirmed` — either is sufficient,
 * because the goal is that a real "yes" is never lost, not that there is one
 * canonical route for it.
 */
export function userConfirmedSend(message: string, history: HistoryTurn[]): boolean {
  return isAffirmative(message) && awaitedConfirmation(history);
}
