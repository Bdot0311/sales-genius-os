/**
 * Checking what the agent says against what it did.
 *
 * The model is not the only witness to its own actions, and it is not a
 * reliable one. It has told users emails went out while the approvals table
 * filled up with rows nothing had reviewed, and told them a batch was complete
 * when a third of it had never been fetched.
 *
 * A claim here is a phrase the agent might write and the tool events that would
 * have to exist for it to be true. When the phrase appears and the events do
 * not, a correction is appended — never a rewrite. Silently editing what an
 * agent said is its own kind of lie, and it hides the failure from whoever has
 * to fix it.
 *
 * Shared so agent-run gets the same treatment as agent-chat. The unattended
 * path having fewer checks than the supervised one was backwards.
 */

export interface ToolEventLike {
  name?: string;
  label?: string;
  status?: string;
  detail?: string;
}

export interface ClaimRule {
  /** Short name, for logs. */
  id: string;
  /** What the agent might write. */
  pattern: RegExp;
  /** Tools that could make it true. */
  tools: string[];
  /**
   * Extra test on a matching event. Used where a tool's success is not the same
   * as the claim being true — a queued approval is not a send.
   */
  backs?: (event: ToolEventLike) => boolean;
  /** Appended when the claim has nothing behind it. */
  correction: string;
}

/** A queued approval or a scheduled send is not a delivery. */
const isRealSend = (e: ToolEventLike) =>
  e.status === "ok" &&
  e.label !== "Waiting for your approval" &&
  !String(e.label ?? "").startsWith("Scheduled");

export const CLAIM_RULES: ClaimRule[] = [
  {
    id: "sent",
    pattern:
      /\b(?:i(?:'ve| have)?\s+(?:just\s+)?sent|sent it|sent them|sent the (?:emails?|second|first|follow[- ]?ups?)|email (?:has been|was) sent|emails? (?:have|has) been sent|they(?:'ve| have) gone out|all sent)\b/i,
    tools: ["send_drafts", "send_outreach", "resolve_approvals", "schedule_drafts"],
    backs: isRealSend,
    correction: "nothing was actually sent in this step.",
  },
  {
    id: "scheduled",
    // "21 Follow-Ups Scheduled for Friday" is the shape that got through: the
    // pattern wanted "is/are scheduled for", and a headline does not say that.
    pattern:
      /\b(?:i(?:'ve| have)?\s+scheduled|scheduled (?:it|them|the|for|\d)|queued (?:it|them|the|\d)|(?:is|are|were|been) scheduled|will send (?:automatically|tomorrow|on ))\b/i,
    tools: ["schedule_drafts"],
    correction: "nothing was actually scheduled in this step.",
  },
  {
    id: "drafted",
    pattern:
      /\b(?:i(?:'ve| have)?\s+(?:written|drafted|prepared)|drafts? (?:are|is) (?:ready|below|saved)|wrote (?:the |a )?(?:email|draft))\b/i,
    tools: ["draft_outreach", "draft_sequence"],
    correction: "no drafts were actually written in this step.",
  },
  {
    id: "enriched",
    pattern: /\b(?:i(?:'ve| have)?\s+enriched|enriched (?:them|the|those)|enrichment (?:is )?(?:done|complete))\b/i,
    tools: ["enrich_leads"],
    correction: "no leads were actually enriched in this step.",
  },
  {
    id: "found",
    pattern:
      /\b(?:i(?:'ve| have)?\s+(?:found|sourced|added)\s+(?:\d+|some|new|more)?\s*(?:leads?|prospects?|contacts?|people)|sourced (?:them|new))\b/i,
    tools: ["find_leads", "search_companies"],
    correction: "no new leads were actually sourced in this step.",
  },
  {
    id: "deleted",
    pattern:
      /\b(?:i(?:'ve| have)?\s+(?:deleted|removed|cleared|rejected)|deleted (?:them|the|those)|(?:has|have|been) (?:been )?(?:deleted|rejected|cleared)|(?:approvals?|drafts?|emails?|leads?|threads?) (?:were |was |all )?(?:rejected|deleted|cleared)|queue (?:is )?clear)\b/i,
    tools: [
      "delete_drafts", "delete_leads", "delete_inbox_threads", "cancel_scheduled_email",
      // Rejecting approvals is how a user clears the approval queue. Omitting
      // it made the guard report a real clearance as an unbacked claim — a
      // false alarm, which costs the guard its credibility faster than a miss.
      "resolve_approvals",
    ],
    correction: "nothing was actually deleted in this step.",
  },
  {
    id: "enrolled",
    pattern: /\b(?:i(?:'ve| have)?\s+enrolled|enrolled (?:them|the)|added (?:them )?to the sequence)\b/i,
    tools: ["enroll_lead_in_sequence"],
    correction: "nobody was actually enrolled in this step.",
  },
];

export interface UnbackedClaim {
  id: string;
  correction: string;
}

/**
 * Claims the text makes that the tool events do not support.
 *
 * Deliberately one-directional: it catches saying a thing happened when it did
 * not. Not saying a thing happened when it did is a worse write-up, not a lie,
 * and correcting it would mean appending noise to every terse reply.
 */
export function unbackedClaims(text: string, events: ToolEventLike[]): UnbackedClaim[] {
  if (!text) return [];

  return CLAIM_RULES.filter((rule) => {
    if (!rule.pattern.test(text)) return false;
    const backing = events.filter((e) => rule.tools.includes(e.name ?? ""));
    const satisfied = rule.backs
      ? backing.some(rule.backs)
      : backing.some((e) => e.status === "ok");
    return !satisfied;
  }).map((rule) => ({ id: rule.id, correction: rule.correction }));
}

/** The sentence to append. Empty when every claim is backed. */
export function correctionFor(claims: UnbackedClaim[]): string {
  if (claims.length === 0) return "";
  const body = claims.map((c) => c.correction).join(" And ");
  return `Correction: ${body}`;
}

// ---------------------------------------------------------------------------
// The backstop.
//
// Patterns are precise and they will always have holes. "21 Follow-Ups
// Scheduled for Friday" walked through one: the scheduled pattern wanted
// "is/are scheduled for", and a headline does not say that. Widening the regex
// fixes that phrasing and not the next one.
//
// So the last line of defence does not read the words at all. It asks one
// question: did this turn change anything? A reply that reads as a completed
// job when nothing succeeded is wrong however it is phrased, and no amount of
// rewording gets around it.
// ---------------------------------------------------------------------------

/** Tools that change something. Reading is not doing. */
export const MUTATION_TOOLS = new Set([
  "send_drafts", "send_outreach", "schedule_drafts", "cancel_scheduled_email",
  "draft_outreach", "draft_sequence", "resolve_approvals",
  "enrich_leads", "score_leads", "research_leads", "find_leads",
  "delete_drafts", "delete_leads", "delete_inbox_threads",
  "enroll_lead_in_sequence", "update_lead", "run_agent",
]);

/** True when at least one mutating tool actually succeeded this turn. */
export function anyMutationSucceeded(events: ToolEventLike[]): boolean {
  return events.some(
    (e) => MUTATION_TOOLS.has(e.name ?? "") && (e.status === "ok" || e.status === "queued"),
  );
}

/**
 * Language that reads as "the job is done".
 *
 * Kept broad on purpose — it only matters when nothing ran, and in that case a
 * reply announcing completion is wrong whatever words it chose.
 */
const COMPLETION_MARKERS =
  /✅|\ball (?:set|clear|done|sent|scheduled)\b|\bsuccessfully\b|\bcomplete(?:d|ly)?\b|\bfinished\b|\bready to send\b|\bno further action\b|\bautomatically\b/i;

/**
 * A reply that announces completion on a turn where nothing succeeded.
 *
 * Returns the record of what did run, so the user gets the truth rather than a
 * denial. Empty string when the turn genuinely changed something, or when the
 * reply makes no claim to have finished anything.
 */
export function emptyTurnWarning(text: string, events: ToolEventLike[]): string {
  if (!text || anyMutationSucceeded(events)) return "";
  if (!COMPLETION_MARKERS.test(text)) return "";

  const ran = events
    .map((e) => `${e.name ?? "tool"} (${e.status ?? "?"})${e.detail ? `: ${e.detail}` : ""}`)
    .slice(-10);

  return ran.length === 0
    ? "Nothing ran on this turn — no tool was called at all, so nothing above happened."
    : `Nothing on this turn changed anything. What actually ran: ${ran.join("; ")}.`;
}
