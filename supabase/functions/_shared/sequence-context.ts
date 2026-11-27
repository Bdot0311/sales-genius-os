/**
 * What a sequence touch knows about being part of a sequence.
 *
 * The cadence lived in generate-sequence's prompt and nowhere else, so the
 * four-touch structure a user designed existed only in the preview. What
 * actually went out was one `introduction` followed by three identical
 * `4ps_followup` calls, each told it was an A/B variant -- because
 * process-sequence-step passed the step number as `variantNum`, which
 * generate-email reads as "this is an A/B variant, so it has to differ in a
 * way worth measuring". A day-7 proof email was being asked to differ from
 * the last one for measurement rather than to do its job.
 *
 * The payoff bank and the brief's forbidden claims had the same shape of
 * problem: binding on the preview, never loaded by the sender. A user could
 * curate approved proof points, watch them constrain the copy on screen, and
 * have every one of them ignored at send.
 *
 * So the cadence, the bank and the forbidden list live here, where both the
 * preview and the sender read them.
 */

export type TouchPurpose = "hook" | "angle" | "proof" | "breakup";

export interface CadenceStep {
  day: number;
  purpose: TouchPurpose;
}

/** Day and job for each touch. The dispatcher walks this and so does the preview. */
export const CADENCE: CadenceStep[] = [
  { day: 1, purpose: "hook" },
  { day: 3, purpose: "angle" },
  { day: 7, purpose: "proof" },
  { day: 14, purpose: "breakup" },
];

/** The step for a 1-based touch number, clamped to the last one for longer runs. */
export function cadenceStep(touchNumber: number): CadenceStep {
  const index = Math.max(1, Math.floor(touchNumber)) - 1;
  return CADENCE[Math.min(index, CADENCE.length - 1)];
}

/**
 * What each touch is for. One job each, and each one says what NOT to do,
 * because the failure these replace was four emails saying the same thing in
 * different words.
 */
const PURPOSE_BRIEF: Record<TouchPurpose, string> = {
  hook: "Open on the single most specific thing you know about them and ask one low-friction question. Do not pitch.",
  angle: "A different reason to care than the first touch used. Do not restate the first touch or refer to it as a follow-up.",
  proof: "One concrete piece of evidence that the problem is solvable, taken from the approved proof points. No new claims.",
  breakup: "Close the loop and make it easy to say no. No guilt, no 'last chance', no new pitch.",
};

export interface PayoffEntry {
  content: string;
  source_url?: string | null;
  asserts_stat?: boolean | null;
}

export interface SequenceContext {
  touchNumber?: number;
  touchCount?: number;
  payoffBank?: PayoffEntry[];
  forbiddenClaims?: string[];
}

/**
 * The block appended to the email writer's prompt. Empty when the caller is
 * not writing a sequence touch, so a Studio or agent draft is unchanged.
 */
export function sequenceContextPrompt(input: SequenceContext): string {
  const touchNumber = Number(input.touchNumber ?? 0);
  const bank = (input.payoffBank ?? []).filter((p) => String(p?.content ?? "").trim());
  const forbidden = (input.forbiddenClaims ?? []).map((c) => String(c ?? "").trim()).filter(Boolean);
  if (touchNumber < 1 && !bank.length && !forbidden.length) return "";

  const parts: string[] = [];
  if (touchNumber >= 1) {
    const step = cadenceStep(touchNumber);
    const total = Number(input.touchCount ?? CADENCE.length);
    parts.push(
      `SEQUENCE TOUCH — this is touch ${touchNumber} of ${total}, sent on day ${step.day}.`,
      `Its job is "${step.purpose}": ${PURPOSE_BRIEF[step.purpose]}`,
      touchNumber > 1
        ? "Earlier touches went to this person already. Do not quote them, do not claim what they said, and do not open with \"following up\"."
        : "This is the first contact. Nothing has been sent to this person yet.",
    );
  }
  if (bank.length) {
    parts.push(
      "",
      "APPROVED PROOF POINTS — the only evidence you may cite, and the only source of any number in this email.",
      "A figure that does not appear below may not be written, in any form.",
      ...bank.slice(0, 20).map((p) => `- ${String(p.content).trim()}${p.source_url ? ` (${p.source_url})` : ""}`),
    );
  }
  if (forbidden.length) {
    parts.push(
      "",
      "FORBIDDEN CLAIMS — never state these, in any wording, however softened:",
      ...forbidden.slice(0, 20).map((c) => `- ${c}`),
    );
  }
  return `\n\n${parts.join("\n")}`;
}
