/** Caller-editable preferences can lower, never raise, the server plan allowance. */
export function remainingAgentReplies(configured: unknown, planLimit: unknown, sentCount: unknown): number {
  const valid = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
  if (!valid(configured) || !valid(planLimit) || !valid(sentCount)) return 0;
  return Math.max(0, Math.min(configured, planLimit) - sentCount);
}