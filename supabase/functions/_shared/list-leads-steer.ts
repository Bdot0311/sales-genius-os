/**
 * list_leads is a lookup, not the job.
 *
 * A turn asked to research, evaluate, and personalize 63 "New" leads called
 * list_leads about thirteen times — 63, then 0, 27, 1, 35 — and never called
 * research_leads or draft_outreach. "New" does not match the stored stage
 * "new", and a draft queue from the previous turn is not something the list
 * result explained, so the model kept changing filters.
 *
 * Two calls are enough to correct a filter. After that the turn is told the
 * next tool and is not given another list.
 */

export interface AskedWork {
  research: boolean;
  evaluate: boolean;
  draft: boolean;
}

export function askedWork(message: string): AskedWork {
  const text = message.toLowerCase();
  return {
    research: /\bresearch/.test(text),
    evaluate: /\b(evaluat|score)/.test(text),
    draft: /\b(personaliz|redraft|draft)/.test(text) || /\b(write|send)\b[^.]*\bemails?\b/.test(text),
  };
}

const LIST_KEYS = [
  "query",
  "pipeline_stage",
  "min_icp_score",
  "needs_enrichment",
  "awaiting_reply",
  "quiet_for_days",
  "tier",
  "without_draft",
  "limit",
] as const;

/** Lowercase the stage and tier so "New" matches the stored value "new". */
export function normalizeListArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of LIST_KEYS) {
    const value = args[key];
    if (value === undefined || value === null || value === "") continue;
    if ((key === "pipeline_stage" || key === "tier") && typeof value === "string") {
      out[key] = value.trim().toLowerCase();
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function listLeadsKey(args: Record<string, unknown>): string {
  return JSON.stringify(normalizeListArgs(args));
}

/** One correction is allowed. The third lookup, or a repeat of the same one, stops. */
export const MAX_LIST_LEADS_CALLS = 2;

export function listLeadGuidance(input: {
  priorTotal: number;
  priorSame: number;
  knownCount: number;
  queuedCount: number;
  returnedCount: number;
  asked: AskedWork;
}): { stop: boolean; note: string } {
  const stop = input.priorSame >= 1 || input.priorTotal >= MAX_LIST_LEADS_CALLS;
  const pipeline = input.asked.research || input.asked.evaluate || input.asked.draft;
  const parts: string[] = [];
  if (stop) {
    parts.push(
      input.knownCount > 0
        ? `Stop looking them up. You already have ${input.knownCount} lead ids from list_leads. Do not call list_leads again this turn.`
        : "Stop looking them up. list_leads already ran this turn. Do not call it again. Use the ids it returned.",
    );
  }
  if (input.queuedCount > 0) {
    parts.push(
      `${input.queuedCount} of these leads are already in the background draft queue. Research and scoring are not blocked by that. A new draft_outreach will not write them again while the queue is still running.`,
    );
  }
  if (pipeline && (stop || input.returnedCount > 0 || input.queuedCount > 0)) {
    const steps: string[] = [];
    if (input.asked.research) steps.push("research_leads with every id from that list");
    if (input.asked.evaluate) steps.push("score_leads with those same ids");
    if (input.asked.draft) {
      steps.push(
        input.queuedCount > 0
          ? "then tell the user those emails are already being written and ask if they want them replaced with versions based on the new research"
          : "then draft_outreach once with all of those ids",
      );
    }
    if (steps.length) parts.push(`Next, in order: ${steps.join(", then ")}.`);
  }
  return { stop, note: parts.join(" ") };
}
