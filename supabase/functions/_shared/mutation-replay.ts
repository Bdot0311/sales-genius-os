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
