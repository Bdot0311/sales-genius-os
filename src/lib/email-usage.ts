/**
 * Timezone-safe helpers for the monthly email cap reset.
 *
 * The cap resets on the 1st of every month at 00:00 UTC.
 * Using UTC guarantees that every account — regardless of the user's local
 * timezone — sees the exact same reset boundary, so two users on the same
 * plan always have equivalent monthly windows.
 */

export function getCurrentMonthStartUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function getNextMonthStartUTC(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/** True if the monthly counter's last reset is older than the current UTC month. */
export function needsMonthlyReset(lastResetAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!lastResetAt) return true;
  const last = typeof lastResetAt === "string" ? new Date(lastResetAt) : lastResetAt;
  return last.getTime() < getCurrentMonthStartUTC(now).getTime();
}

/** Days remaining until the next monthly reset (rounded up). */
export function daysUntilReset(now: Date = new Date()): number {
  const next = getNextMonthStartUTC(now).getTime();
  return Math.max(1, Math.ceil((next - now.getTime()) / 86_400_000));
}

export function formatMonthlyLimit(limit: number): string {
  if (limit < 0) return "Unlimited";
  return limit.toLocaleString();
}
