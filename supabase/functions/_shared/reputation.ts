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
}

export interface ReputationResult {
  score: number | null; // null = insufficient data
  volume: number;
  bounceRate: number; // 0–1
  complaintRate: number; // 0–1
  openRate: number; // 0–1
}

export function computeReputation(input: ReputationInputs): ReputationResult {
  const sent = Math.max(0, input.sent);
  const bounceRate = sent > 0 ? input.bounced / sent : 0;
  const complaintRate = sent > 0 ? input.complaints / sent : 0;
  const openRate = sent > 0 ? input.opened / sent : 0;

  if (sent < MIN_VOLUME_FOR_SCORE) {
    return { score: null, volume: sent, bounceRate, complaintRate, openRate };
  }

  // Bounces are the strongest deliverability signal; complaints are the most
  // damaging per-unit. Penalties are calibrated to the thresholds in
  // OUTBOUND_KB (bounce warn 2% / danger 5%; complaint warn 0.1% / danger 0.3%).
  const bouncePenalty = Math.min(50, bounceRate * 600); // 5% -> 30, 8.3% -> 50 cap
  const complaintPenalty = Math.min(40, complaintRate * 13000); // 0.1% -> 13, 0.3% -> 39
  // Weak engagement is a soft negative and only at real volume (opens are noisy).
  const lowEngagementPenalty = sent >= 50 && openRate < 0.05 ? 5 : 0;

  const score = Math.round(
    Math.max(0, Math.min(100, 100 - bouncePenalty - complaintPenalty - lowEngagementPenalty)),
  );

  return { score, volume: sent, bounceRate, complaintRate, openRate };
}
