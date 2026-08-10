// Shared reputation scoring. Deterministic, from real per-account counts.
// A score is only produced when there is enough volume to be meaningful;
// below the floor we return null ("insufficient data") rather than a made-up
// number.

export const MIN_VOLUME_FOR_SCORE = 20;

export interface ReputationInputs {
  sent: number;
  bounced: number;
  complaints: number;
  opened: number;
  /** Warmup traffic from the same mailbox — real send volume, so it counts. */
  warmupSent?: number;
  warmupInbox?: number;
  warmupSpam?: number;
}

export interface ReputationResult {
  score: number | null; // null = insufficient data
  /** Outreach + warmup sends. This is what the score unlocks on. */
  volume: number;
  outreachVolume: number;
  warmupVolume: number;
  bounceRate: number; // 0–1
  complaintRate: number; // 0–1
  openRate: number; // 0–1
}

export function computeReputation(input: ReputationInputs): ReputationResult {
  const sent = Math.max(0, input.sent);
  const warmupSent = Math.max(0, input.warmupSent ?? 0);
  const warmupInbox = Math.max(0, input.warmupInbox ?? 0);
  const warmupSpam = Math.max(0, input.warmupSpam ?? 0);
  const classified = warmupInbox + warmupSpam;
  // Bounce/complaint/open rates stay on outreach — warmup mail is between our
  // own mailboxes, so mixing it in would flatter the rates.
  const bounceRate = sent > 0 ? input.bounced / sent : 0;
  const complaintRate = sent > 0 ? input.complaints / sent : 0;
  const openRate = sent > 0 ? input.opened / sent : 0;
  const volume = sent + warmupSent;
  const base = { volume, outreachVolume: sent, warmupVolume: warmupSent, bounceRate, complaintRate, openRate };

  if (volume < MIN_VOLUME_FOR_SCORE) {
    return { score: null, ...base };
  }

  // Warmup placement is a direct read on how the mailbox is being treated.
  const spamPlacementPenalty = classified > 0 ? Math.min(25, (warmupSpam / classified) * 100) : 0;

  // Bounces are the strongest deliverability signal; complaints are the most
  // damaging per-unit. Penalties are calibrated to the thresholds in
  // OUTBOUND_KB (bounce warn 2% / danger 5%; complaint warn 0.1% / danger 0.3%).
  const bouncePenalty = Math.min(50, bounceRate * 600); // 5% -> 30, 8.3% -> 50 cap
  const complaintPenalty = Math.min(40, complaintRate * 13000); // 0.1% -> 13, 0.3% -> 39
  // Weak engagement is a soft negative and only at real volume (opens are noisy).
  const lowEngagementPenalty = sent >= 50 && openRate < 0.05 ? 5 : 0;

  const score = Math.round(
    Math.max(0, Math.min(100, 100 - bouncePenalty - complaintPenalty - spamPlacementPenalty - lowEngagementPenalty)),
  );

  return { score, ...base };
}
