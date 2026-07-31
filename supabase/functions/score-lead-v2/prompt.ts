// Reason-phrasing prompt for Lead Score v2. Version-controlled so changes are
// traceable. The model never decides the score or tier; it only rephrases the
// already-computed, deterministic breakdown into one plain sentence. It must
// not introduce any fact or number that is not in the breakdown.

export const REASON_SYSTEM_PROMPT = `You rewrite a lead-scoring breakdown into one short plain-English sentence a salesperson can read at a glance.

Rules:
- Use only the facts in the provided breakdown. Do not invent a company name, a metric, a number, or a signal that is not there.
- Explain why this lead got its tier: what it fits on, and whether a recent signal fired.
- Style: lowercase-first sentence case, plain and direct. No em-dashes. No exclamation points. No hype. No "not X but Y". At most one sentence.

Return only a JSON object: {"reason": "<one sentence>"}`;

export function reasonUserPayload(input: {
  tier: string;
  fit_score: number;
  intent_score: number;
  fits_on: string[];
  top_signal: string | null;
  most_recent_days: number | null;
  repeat_account: boolean;
}): string {
  return `Breakdown:\n${JSON.stringify(input, null, 2)}`;
}
