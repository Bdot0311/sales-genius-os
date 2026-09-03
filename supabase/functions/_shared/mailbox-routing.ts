/**
 * Choosing which mailbox sends to a given lead.
 *
 * The requirement this is built against is auditability: "a routing decision
 * the user cannot audit is worse than no routing." That rules out asking a
 * model. The inputs — provider, local time, mailbox health, remaining capacity
 * — are all things with a known correct answer, and a scorer that produces the
 * same decision every time with a reason attached is strictly more auditable
 * than a model that produces a plausible one. The model is used where judgment
 * genuinely helps (rewriting risky copy), not here.
 *
 * Every recommendation carries the sentence that explains it, built from the
 * factors that actually moved the score.
 */

export interface RoutableMailbox {
  id: string;
  email: string;
  /** Domain the mailbox sends from, used for same-provider affinity. */
  provider: string | null;
  reputationScore: number | null;
  status: string;
  sentToday: number;
  dailyLimit: number;
  warmupEnabled: boolean;
  /** ISO timestamp of the last send, for spacing. */
  lastSentAt?: string | null;
}

export interface RoutingRequest {
  /** The recipient's mailbox provider, as far as we can tell from the domain. */
  recipientProvider?: string | null;
  /** IANA zone for the recipient, when known. */
  recipientTimezone?: string | null;
  /** Overridable for tests. */
  now?: Date;
}

export interface RoutingDecision {
  mailboxId: string | null;
  email: string | null;
  /** One sentence, built from the factors that actually decided it. */
  explanation: string;
  /** Every candidate with its score, so the choice can be checked. */
  considered: { id: string; email: string; score: number; notes: string[] }[];
}

/** Rough provider from an email domain. Unknown is a fine answer. */
export function providerOf(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (!domain) return null;
  if (/gmail\.com|googlemail\.com/.test(domain)) return "google";
  if (/outlook\.|hotmail\.|live\.|msn\.com/.test(domain)) return "microsoft";
  if (/yahoo\.|ymail\./.test(domain)) return "yahoo";
  return null;
}

/** Local hour for a zone, or null when the zone is missing or unusable. */
export function localHour(timezone: string | null | undefined, now: Date): number | null {
  if (!timezone) return null;
  try {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "numeric", hour12: false,
    }).format(now);
    const hour = Number(formatted);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    // An unrecognised zone is not a reason to fail the send.
    return null;
  }
}

/** Business hours in the recipient's zone, the window worth sending into. */
export function isBusinessHours(hour: number | null): boolean | null {
  if (hour === null) return null;
  return hour >= 8 && hour < 18;
}

export function chooseMailbox(
  mailboxes: RoutableMailbox[],
  request: RoutingRequest = {},
): RoutingDecision {
  const now = request.now ?? new Date();

  const eligible = mailboxes.filter(
    (m) => m.status === "active" && m.dailyLimit - m.sentToday > 0,
  );

  if (eligible.length === 0) {
    const reason = mailboxes.length === 0
      ? "No mailboxes are connected."
      : mailboxes.every((m) => m.status !== "active")
        ? "Every mailbox is paused or disconnected."
        : "Every mailbox has already sent its full allowance for today.";
    return { mailboxId: null, email: null, explanation: reason, considered: [] };
  }

  const scored = eligible.map((m) => {
    const notes: string[] = [];
    let score = 0;

    // Reputation dominates. A mailbox with no score yet is treated as average
    // rather than as bad — a new mailbox has done nothing wrong.
    const reputation = m.reputationScore ?? 70;
    score += reputation;
    if (m.reputationScore === null) notes.push("no reputation score yet, treated as average");
    else if (reputation >= 90) notes.push("strongest reputation in the pool");
    else if (reputation < 60) notes.push("weak reputation");

    // Headroom, as a share of the limit. Spreading load is what keeps any one
    // mailbox from looking like a spike.
    const headroom = m.dailyLimit - m.sentToday;
    const headroomShare = m.dailyLimit > 0 ? headroom / m.dailyLimit : 0;
    score += headroomShare * 30;
    if (headroomShare > 0.8) notes.push("barely used today");
    else if (headroomShare < 0.2) notes.push("close to its daily limit");

    // Same-provider affinity: Google-to-Google and Microsoft-to-Microsoft
    // authenticate more cleanly and are filtered less often.
    if (request.recipientProvider && m.provider && request.recipientProvider === m.provider) {
      score += 15;
      notes.push(`same provider as the recipient (${m.provider})`);
    }

    // A mailbox still warming should carry as little cold volume as possible.
    if (m.warmupEnabled) {
      score -= 20;
      notes.push("still warming up");
    }

    return { id: m.id, email: m.email, score: Math.round(score), notes };
  }).sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));

  const winner = scored[0];
  const hour = localHour(request.recipientTimezone, now);
  const business = isBusinessHours(hour);

  // Timing does not change WHICH mailbox sends — it is the same decision at
  // any hour — but it belongs in the explanation, because it is the thing the
  // user is most likely to want to override.
  const timing = business === null
    ? ""
    : business
      ? " It is inside business hours for the recipient."
      : ` It is ${hour}:00 for the recipient, outside business hours — worth scheduling rather than sending now.`;

  const why = winner.notes.length > 0
    ? ` — ${winner.notes.join(", ")}`
    : " as the best available option";

  return {
    mailboxId: winner.id,
    email: winner.email,
    explanation: `Sending from ${winner.email}${why}.${timing}`,
    considered: scored,
  };
}
