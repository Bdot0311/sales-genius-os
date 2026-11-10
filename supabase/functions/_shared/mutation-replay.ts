/**
 * A mutating tool is recorded as dispatching before it runs.
 * Any stored status means this process must not run it again.
 * A missing row is the only state that may start the action.
 * Restart reads the same row, so the decision is not an in-memory set.
 */
export function replayDecision(status: "dispatching" | "completed" | "unknown" | null): "run" | "skip" {
  if (status === null) return "run";
  return "skip";
}

/**
 * The claim insert failed before the tool ran.
 *
 * That is not an unknown outcome. Nothing started, so the model may try again.
 * The payload must not contain unknown_outcome: that string is what the turn
 * treats as "do not run this again".
 */
export function claimStartFailure(): { error: "retryable"; retryable: true; note: string } {
  return {
    error: "retryable",
    retryable: true,
    note: "This action did not start because the dispatch record could not be saved. It is safe to try again.",
  };
}
