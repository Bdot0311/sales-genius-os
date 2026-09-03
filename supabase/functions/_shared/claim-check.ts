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
    pattern:
      /\b(?:i(?:'ve| have)?\s+scheduled|scheduled (?:it|them|the)|queued (?:it|them|the)|(?:is|are) scheduled for)\b/i,
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
      /\b(?:i(?:'ve| have)?\s+(?:deleted|removed|cleared)|deleted (?:them|the|those)|(?:has|have) been deleted)\b/i,
    tools: ["delete_drafts", "delete_leads", "delete_inbox_threads", "cancel_scheduled_email"],
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
