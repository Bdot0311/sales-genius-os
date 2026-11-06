/**
 * Whether a send may proceed, given the live gate and any stored verdict.
 *
 * The live gate always runs. Canary off (the default) does not let a stored
 * verdict authorize or block a send. Canary on requires a clear verdict for
 * this exact content hash and these prompt hashes. A changed body does not
 * reuse the old verdict. A client "passed" flag is not an input.
 */

export interface StoredVerdict {
  contentHash: string;
  gateStatus: "clear" | "needs_review" | "refused";
  promptHash: string;
  rubricPromptHash: string;
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
  canary: boolean;
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
    );
    return { allow: true, reason: "live_gate_clear", shadowMismatch: mismatch };
  }
  if (stored && stored.contentHash !== input.contentHash) {
    return { allow: false, reason: "verdict_missing_or_stale", shadowMismatch: true };
  }
  if (!stored) {
    return { allow: true, reason: "live_gate_clear_no_prior_verdict", shadowMismatch: false };
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
