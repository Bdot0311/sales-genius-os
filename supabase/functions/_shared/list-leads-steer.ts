/**
 * list_leads is a lookup, not the job.
 *
 * A turn asked to research, evaluate, and personalize 63 "New" leads called
 * list_leads about thirteen times — 63, then 0, 27, 1, 35 — and never called
 * research_leads or draft_outreach. "New" does not match the stored stage
 * "new", and a draft queue from the previous turn is not something the list
 * result explained, so the model kept changing filters.
 *
 * The same filter is not run twice. A different filter is still a real set.
 * After a handful of lookups the turn is told the next tool instead.
 */

export interface AskedWork {
  research: boolean;
  evaluate: boolean;
  draft: boolean;
}

/**
 * "drafts", "draft a sequence", "send my drafts" and "audit this draft" are
 * not a request to write new outreach. Personalize / redraft / "draft emails"
 * are.
 */
export function wantsNewOutreach(text: string): boolean {
  const message = text.toLowerCase();
  if (/\b(personaliz\w*|redraft\w*)\b/.test(message)) return true;
  if (/\bdraft\s+(?:a\s+)?sequence\b/.test(message)) return false;
  if (/\b(?:audit|send|schedule|delete|cancel)\b[^.]*\bdrafts?\b/.test(message)) return false;
  if (/\bdraft\s+(?:the\s+|some\s+)?(?:emails?|outreach|them|these|those)\b/.test(message)) return true;
  if (/\bwrite\b[^.]*\bemails?\b/.test(message)) return true;
  return false;
}

export function askedWork(message: string): AskedWork {
  const text = message.toLowerCase();
  return {
    research: /\bresearch/.test(text),
    evaluate: /\b(evaluat|score)/.test(text),
    draft: wantsNewOutreach(text),
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
    if (key === "limit" && (value === 25 || value === "25")) continue;
    if (value === false) continue;
    out[key] = value;
  }
  return out;
}

export function listLeadsKey(args: Record<string, unknown>): string {
  return JSON.stringify(normalizeListArgs(args));
}

/**
 * Identical filters stop on the repeat. A different filter (tier A, then B,
 * then C) is a real second set and is allowed. The cap is only the runaway
 * that listed thirteen times.
 */
export const MAX_LIST_LEADS_CALLS = 6;

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

/**
 * Tools that already did something this turn. A pipeline nudge must not
 * override them, and must not invent a draft for a send, a sequence, or an audit.
 */
const ACTION_TOOLS = new Set([
  "send_drafts",
  "send_outreach",
  "schedule_drafts",
  "cancel_scheduled_email",
  "draft_sequence",
  "draft_outreach",
  "audit_email",
  "audit_sequence",
  "enrich_leads",
  "score_leads",
  "research_leads",
  "find_leads",
  "run_full_agent",
  "delete_drafts",
  "delete_leads",
  "delete_inbox_threads",
  "enroll_lead_in_sequence",
  "update_lead",
  "update_sending_account",
  "update_sequence_status",
  "update_enrollment",
]);

/**
 * The end-of-turn push from a lookup into research, scoring, and drafting.
 *
 * Empty unless this turn already listed leads and came back with ids, the
 * user asked for that pipeline, and nothing else has acted. A question, a
 * send, or "draft a sequence" stays empty so the stalled-promise nudge still
 * owns the turn.
 */
export function pipelineContinuation(input: {
  message: string;
  events: Array<{ name?: string }>;
  listedCount: number;
  queuedCount?: number;
}): string {
  const asked = askedWork(input.message);
  if (!(asked.research || asked.evaluate || asked.draft)) return "";
  const names = input.events.map((event) => event.name ?? "").filter(Boolean);
  if (!names.includes("list_leads") || input.listedCount <= 0) return "";
  if (names.some((name) => ACTION_TOOLS.has(name))) return "";
  return listLeadGuidance({
    priorTotal: MAX_LIST_LEADS_CALLS,
    priorSame: 1,
    knownCount: input.listedCount,
    queuedCount: input.queuedCount ?? 0,
    returnedCount: input.listedCount,
    asked,
  }).note;
}
