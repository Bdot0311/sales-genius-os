/**
 * Pulling a failing mailbox out of rotation, and saying so.
 *
 * Auto-quarantine changes sending behaviour without being asked. That is only
 * acceptable with a record — every action, why it fired, what it moved and
 * where — which is what mailbox_quarantine_log is for.
 *
 * The redistribution rule is the important one, and it is deliberately
 * conservative: capacity is only moved into headroom that already exists on
 * healthy mailboxes. Nobody's daily limit is ever raised to absorb the
 * shortfall. Raising a healthy mailbox's limit to cover a failing one is how a
 * reputation problem spreads from one mailbox to the whole rotation, which is
 * the exact failure this feature exists to prevent.
 */

export interface QuarantineCandidate {
  id: string;
  email: string;
  score: number | null;
  threshold: number;
  status: string;
  sentToday: number;
  dailyLimit: number;
}

export interface RedistributionTarget {
  id: string;
  email: string;
  /** Sends still available on this mailbox today. Never increased. */
  headroom: number;
}

export interface RedistributionPlan {
  /** Sends the quarantined mailbox would have made for the rest of today. */
  strandedVolume: number;
  /** How much of that healthy mailboxes can absorb without raising a limit. */
  absorbed: number;
  /** Where it went, for the log. */
  destinations: { id: string; email: string; volume: number }[];
  /** Sends that simply will not happen today. Reported, not hidden. */
  unabsorbed: number;
}

/** Whether a mailbox should be pulled from rotation right now. */
export function shouldQuarantine(
  candidate: QuarantineCandidate,
  enabled: boolean,
): boolean {
  if (!enabled) return false;
  // A null score is "not enough data", not "bad". Quarantining on it would
  // pull every new mailbox the moment it connects.
  if (candidate.score === null) return false;
  if (candidate.status !== "active") return false;
  return candidate.score < candidate.threshold;
}

/**
 * Spread the stranded volume across healthy mailboxes, largest headroom first.
 *
 * Largest-first keeps the added load on the mailboxes best able to carry it
 * rather than topping every mailbox up to its ceiling, which would push several
 * to their limit at once and make the whole rotation look like a volume spike.
 */
export function planRedistribution(
  candidate: QuarantineCandidate,
  targets: RedistributionTarget[],
): RedistributionPlan {
  const stranded = Math.max(0, candidate.dailyLimit - candidate.sentToday);

  const usable = targets
    .filter((t) => t.headroom > 0)
    .sort((a, b) => b.headroom - a.headroom);

  let remaining = stranded;
  const destinations: { id: string; email: string; volume: number }[] = [];

  for (const target of usable) {
    if (remaining <= 0) break;
    const volume = Math.min(target.headroom, remaining);
    destinations.push({ id: target.id, email: target.email, volume });
    remaining -= volume;
  }

  return {
    strandedVolume: stranded,
    absorbed: stranded - remaining,
    destinations,
    unabsorbed: remaining,
  };
}

/** The reason recorded on the log and shown to the user. Never a status code. */
export function quarantineReason(candidate: QuarantineCandidate): string {
  return `Reputation fell to ${candidate.score}, below the ${candidate.threshold} threshold. ` +
    `Pulled from rotation so the rest of the mailboxes are not dragged down with it.`;
}

/** One line summarising the save, for the recovery ledger. */
export function redistributionSummary(plan: RedistributionPlan): string {
  if (plan.strandedVolume === 0) return "No sends were scheduled on this mailbox today.";
  if (plan.absorbed === 0) {
    return `${plan.strandedVolume} sends could not be moved — no other mailbox has capacity left today.`;
  }
  if (plan.unabsorbed === 0) {
    return `${plan.absorbed} sends moved to ${plan.destinations.length} healthy mailbox${plan.destinations.length === 1 ? "" : "es"}.`;
  }
  return `${plan.absorbed} of ${plan.strandedVolume} sends moved to healthy mailboxes; ` +
    `${plan.unabsorbed} will not go out today.`;
}
