/**
 * Whether a send may proceed, given the live gate and a verdict this server
 * just produced for the exact final subject and body.
 *
 * The live gate always runs. Canary off (the default) does not let a stored
 * verdict authorize or block a send. Canary on requires the verdict that was
 * persisted for this request: same account, same content hash, current prompt
 * hashes, and a clear gate. A missing row is not permission. A stale or
 * other-account row is not permission. A client "passed" flag is not an input.
 * The rubric availability is recorded on the row. It is not a new entitlement.
 */

export interface StoredVerdict {
  contentHash: string;
  gateStatus: "clear" | "needs_review" | "refused";
  promptHash: string;
  rubricPromptHash: string;
  /** Account that owns the row. A different account's verdict cannot authorize. */
  userId: string;
}

export interface SendDecision {
  allow: boolean;
  reason: string;
  /** Shadow comparison disagreed with the live gate or the stored hash. */
  shadowMismatch: boolean;
}

export function evaluateSend(input: {
  liveBlocked: boolean;
  contentHash: string;
  promptHash: string;
  rubricPromptHash: string;
  stored: StoredVerdict | null;
  /** True only when this request persisted `stored` for this account. */
  persisted: boolean;
  canary: boolean;
  userId: string;
}): SendDecision {
  const stored = input.stored;
  if (input.liveBlocked) {
    return {
      allow: false,
      reason: "live_gate",
      shadowMismatch: !!stored && stored.contentHash === input.contentHash && stored.gateStatus === "clear",
    };
  }
  if (!input.canary) {
    const mismatch = !!stored && (
      stored.contentHash !== input.contentHash
      || stored.gateStatus !== "clear"
      || stored.promptHash !== input.promptHash
      || stored.rubricPromptHash !== input.rubricPromptHash
      || stored.userId !== input.userId
    );
    return { allow: true, reason: "live_gate_clear", shadowMismatch: mismatch };
  }
  if (!input.persisted || !stored) {
    return { allow: false, reason: "verdict_not_persisted", shadowMismatch: false };
  }
  if (stored.userId !== input.userId) {
    return { allow: false, reason: "verdict_wrong_account", shadowMismatch: true };
  }
  if (stored.contentHash !== input.contentHash) {
    return { allow: false, reason: "verdict_missing_or_stale", shadowMismatch: true };
  }
  if (stored.promptHash !== input.promptHash || stored.rubricPromptHash !== input.rubricPromptHash) {
    return { allow: false, reason: "prompt_version_mismatch", shadowMismatch: true };
  }
  if (stored.gateStatus !== "clear") {
    return { allow: false, reason: "verdict_not_clear", shadowMismatch: false };
  }
  return { allow: true, reason: "verdict_matches", shadowMismatch: false };
}

/** A step result may perform its side effect only when this worker just claimed it. */
export function shouldExecuteStep(status: string): boolean {
  return status === "claimed";
}
