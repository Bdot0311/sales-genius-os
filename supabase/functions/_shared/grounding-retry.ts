/**
 * What to do when a draft fails the grounding gate.
 *
 * The gate stays. A refusal is told to the writer, once and then once more,
 * with the sentence that was refused. A provider that did not answer is not a
 * refusal: recording it as "the research doesn't support this" made a 429
 * permanent, because that sentence is not retried.
 */

export type GroundingAttemptStatus = "released" | "refused" | "unavailable";

export interface GroundingAttempt {
  status: GroundingAttemptStatus;
  reason: string;
}

export async function retryGroundedDraft(
  problems: string[],
  attempt: (notes: string[]) => Promise<GroundingAttempt>,
  maxAttempts = 2,
): Promise<GroundingAttempt & { attempts: number }> {
  const notes = [...problems];
  const cap = Math.max(1, Math.min(2, maxAttempts));
  let reason = "";
  for (let i = 0; i < cap; i++) {
    const result = await attempt(notes);
    if (result.status === "released" || result.status === "unavailable") {
      return { ...result, attempts: i + 1 };
    }
    reason = result.reason || reason;
    if (reason && !notes.includes(reason)) notes.push(reason);
  }
  return { status: "refused", reason, attempts: cap };
}

export function rewriteStatusFromProvider(status: number): "unavailable" | "refused" {
  if (status === 429 || (status >= 500 && status < 600)) return "unavailable";
  return "refused";
}

export function groundingTerminalError(input: { viaFallback: boolean; reason: string; outsideSource?: boolean }): { error: string; error_code: string } {
  // Parallel or Context already supplied a finding. Calling that "only a
  // copied line" blamed the research for a rewrite that did not land.
  if (input.viaFallback && !input.outsideSource) {
    return {
      error: "The research supported only a copied line from their site, with no grounded reason to reach out, so no draft was saved. Add more detail to Your Business or the lead and try again.",
      error_code: "thin_research_draft",
    };
  }
  return {
    error: `The draft said something about this company the research does not support ("${input.reason.slice(0, 70)}"), so it was not saved.`,
    error_code: "unsupported_prospect_claim",
  };
}

/** The body generate-email returns once the rewrite loop has finished. */
export function settleGrounding(input: {
  status: GroundingAttemptStatus;
  viaFallback: boolean;
  reason: string;
  outsideSource?: boolean;
}): { ok: true } | { ok: false; error: string; error_code: string } {
  if (input.status === "released") return { ok: true };
  if (input.status === "unavailable") {
    return {
      ok: false,
      error: "AI is rate limited right now. Wait a moment and try again.",
      error_code: "rate_limit",
    };
  }
  return { ok: false, ...groundingTerminalError(input) };
}
