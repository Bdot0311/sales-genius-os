/**
 * What a failed payment does to an account, as one pure rule set.
 *
 * - First failure: the paid plan stays on for a short grace window.
 * - Grace over, still unpaid: the account drops to free temporarily; paying
 *   restores the paid plan.
 * - Recovery window over, or the retry limit reached: the Stripe subscription
 *   is cancelled and the account stays on free for good.
 *
 * Imports nothing, so vitest can test it and Deno can run it.
 */
export const DUNNING = {
  /** Paid access after the first failed payment. */
  graceDays: 1,
  /** Days from the first failure until the downgrade becomes permanent. */
  recoveryDays: 3,
  /** Retries after the first attempt before the downgrade becomes permanent. */
  maxRetries: 3,
} as const;

const DAY_MS = 86_400_000;

export type DunningStage = "ok" | "grace" | "temporary_free" | "final";

/**
 * @param firstFailedAt when this run of failures began (null = never failed)
 * @param attemptCount  Stripe's attempt_count for the invoice (1 = first try)
 */
export function dunningStage(
  firstFailedAt: Date | string | null,
  attemptCount: number,
  now: Date = new Date(),
): DunningStage {
  if (!firstFailedAt) return "ok";
  const start = new Date(firstFailedAt).getTime();
  const elapsed = now.getTime() - start;
  if (attemptCount - 1 >= DUNNING.maxRetries) return "final";
  if (elapsed >= DUNNING.recoveryDays * DAY_MS) return "final";
  if (elapsed < DUNNING.graceDays * DAY_MS) return "grace";
  return "temporary_free";
}

/** Only the first failure and the final one are worth an admin alert. */
export function shouldAlertForFailure(attemptCount: number, stage: DunningStage): boolean {
  return attemptCount <= 1 || stage === "final";
}

export function graceEndsAt(firstFailedAt: Date | string): string {
  return new Date(new Date(firstFailedAt).getTime() + DUNNING.graceDays * DAY_MS).toISOString();
}

export function recoveryEndsAt(firstFailedAt: Date | string): string {
  return new Date(new Date(firstFailedAt).getTime() + DUNNING.recoveryDays * DAY_MS).toISOString();
}
