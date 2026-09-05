/**
 * Auditing a whole sequence, which is where the failures that matter live.
 *
 * Every email in a sequence can pass its own audit and the sequence still not
 * work, because the two commonest failures are properties of the set rather
 * than of any member:
 *
 *   - Every email says the same thing. The prospect read the first one and
 *     ignored it, so there is no reason to read the fifth; it carries no new
 *     information. That is not follow-up, it is repetition with a friendlier
 *     tone — and no individual email looks wrong.
 *   - The touches are bunched or scattered. Bunching reads as pressure;
 *     leaving weeks means starting from cold again.
 *
 * Neither is visible one email at a time, which is why sequence_steps had no
 * check on it at all beyond a per-step word count nobody enforced.
 *
 * The repetition test reuses the content-word overlap built for brief-diff.
 * The same problem in both places: the same idea comes back differently
 * worded, and a literal comparison would call every touch new.
 */

import { contentWords } from "./grounding.ts";
import { auditEmail, findAsks, type Finding } from "./email-audit.ts";

/** Day offsets from the first send: tight while in memory, widening after. */
export const CANONICAL_DAYS = [1, 3, 7, 11, 15, 21];

export interface SequenceStepInput {
  step_number: number;
  subject_template?: string | null;
  body_template?: string | null;
  /** Days to wait before THIS step, cumulative from the first send. */
  day?: number | null;
}

export interface SequenceFinding extends Finding {
  /** Which step it belongs to; 0 for findings about the sequence as a whole. */
  step: number;
}

/**
 * How much of email B's substance already appeared in email A.
 *
 * Measured against B, not against the shorter of the two: a long fifth email
 * that restates a short first one is repetition, and normalising by the
 * shorter text would score it as new.
 */
export function overlapRatio(a: string, b: string): number {
  const wordsA = new Set(contentWords(a));
  const wordsB = contentWords(b);
  if (wordsB.length === 0) return 0;
  const unique = new Set(wordsB);
  if (unique.size === 0) return 0;
  let shared = 0;
  for (const w of unique) if (wordsA.has(w)) shared++;
  return shared / unique.size;
}

/** Above this, a touch is carrying nothing the earlier ones did not. */
export const REPEAT_THRESHOLD = 0.72;

export function auditSequence(steps: SequenceStepInput[]): SequenceFinding[] {
  const out: SequenceFinding[] = [];
  const ordered = [...steps].sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
  if (ordered.length === 0) return out;

  const add = (step: number, f: Finding) => out.push({ ...f, step });

  // Per-email rules, with the position so the value touch and the breakup are
  // held to their own standards.
  for (const step of ordered) {
    const body = String(step.body_template ?? "");
    if (!body.trim()) continue;
    for (const f of auditEmail({
      subject: step.subject_template ?? "",
      body,
      position: step.step_number,
    })) {
      add(step.step_number, f);
    }
  }

  // ─── Does each touch carry something new? ────────────────────────────────
  for (let i = 1; i < ordered.length; i++) {
    const body = String(ordered[i].body_template ?? "");
    if (!body.trim()) continue;
    const earlier = ordered.slice(0, i).map((s) => String(s.body_template ?? "")).join("\n");
    if (!earlier.trim()) continue;
    const ratio = overlapRatio(earlier, body);
    if (ratio >= REPEAT_THRESHOLD) {
      add(ordered[i].step_number, {
        rule: "repeats_earlier_touch",
        severity: "warning",
        evidence: `${Math.round(ratio * 100)}% of this email's substance already appeared earlier in the sequence`,
        why:
          "They ignored it the first time and this gives them no new reason to read. " +
          "Six emails repeating one idea is spam with better manners, and they stopped at two.",
        fix: "Give this touch a job the others do not do: the mechanism, a comparable, pure value, or the cost of standing still.",
      });
    }
  }

  // ─── Spacing ─────────────────────────────────────────────────────────────
  const dated = ordered.filter((s) => typeof s.day === "number" && Number.isFinite(s.day));
  for (let i = 1; i < dated.length; i++) {
    const gap = (dated[i].day as number) - (dated[i - 1].day as number);
    if (gap <= 0) {
      add(dated[i].step_number, {
        rule: "steps_out_of_order",
        severity: "blocker",
        evidence: `step ${dated[i].step_number} lands on day ${dated[i].day}, not after step ${dated[i - 1].step_number} on day ${dated[i - 1].day}`,
        why: "Two emails on the same day, or out of order, is the single clearest signal that nobody is reading the replies.",
        fix: `Space them. The shape that works is ${CANONICAL_DAYS.join(", ")}.`,
      });
    } else if (gap === 1 && i > 1) {
      add(dated[i].step_number, {
        rule: "touches_bunched",
        severity: "warning",
        evidence: `only ${gap} day after step ${dated[i - 1].step_number}`,
        why: "Bunching reads as pressure, and pressure from a stranger reads as spam.",
        fix: `Widen the gap as the sequence goes on: ${CANONICAL_DAYS.join(", ")}.`,
      });
    } else if (gap > 14) {
      add(dated[i].step_number, {
        rule: "touches_too_far_apart",
        severity: "warning",
        evidence: `${gap} days after step ${dated[i - 1].step_number}`,
        why: "Past a fortnight you are no longer in recent memory, so this touch starts from cold again.",
        fix: `Bring it in. The shape that works is ${CANONICAL_DAYS.join(", ")}.`,
      });
    }
  }

  // ─── Is there a touch that asks for nothing? ─────────────────────────────
  const bodies = ordered.map((s) => String(s.body_template ?? "")).filter((b) => b.trim());
  if (bodies.length >= 4 && bodies.every((b) => findAsks(b).length > 0)) {
    add(0, {
      rule: "every_touch_asks",
      severity: "warning",
      evidence: `all ${bodies.length} emails contain an ask`,
      why:
        "A sequence that only ever asks becomes something the prospect wants to end. " +
        "The touch that asks for nothing is the commonest one to cut and the costliest, because it is what buys the next ask a hearing.",
      fix: "Make one middle touch pure value: something useful you did not write, and 'no reply needed'.",
    });
  }

  return out;
}

/** The sentence the agent has to pass on about a whole sequence. */
export function sequenceSummary(findings: SequenceFinding[], stepCount: number): string {
  if (findings.length === 0) {
    return `All ${stepCount} steps pass the mechanical checks.`;
  }
  const blockers = findings.filter((f) => f.severity === "blocker").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const steps = new Set(findings.filter((f) => f.step > 0).map((f) => f.step));
  return (
    `${blockers} blocker(s) and ${warnings} warning(s) across ${steps.size} of ${stepCount} steps. ` +
    "Name the step number for each one when you report it."
  );
}
