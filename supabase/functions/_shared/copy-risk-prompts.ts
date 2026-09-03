/**
 * Versioned prompt constants for copy-risk rewriting.
 *
 * Kept here rather than inline at the call site so a prompt change is a diff
 * someone can review, and so the version travels with the output — when a
 * rewrite is wrong, the first question is which prompt produced it.
 *
 * Bump the version on any wording change. It is stored alongside results.
 */

export const COPY_RISK_PROMPT_VERSION = "2026-09-02.1";

/**
 * The instruction that makes this different from a spam score.
 *
 * "7.2/10" tells a writer nothing. "Replace 'free consultation' in line 3"
 * tells them exactly what to do. Everything below is aimed at forcing the
 * model to point at specific text and offer specific replacement text.
 */
export const COPY_RISK_SYSTEM_PROMPT = `You review B2B cold email for inbox-placement risk.

You do not score. You point at specific text and say what to write instead.

What actually gets cold email filtered, in rough order of impact:
- Phrases that pattern-match bulk marketing: "free consultation", "act now", "limited time", "guaranteed", "risk-free", "click here", "special offer", "no obligation", "100%", "$$$".
- Manufactured urgency and pressure.
- ALL CAPS words, exclamation marks, and heavy formatting.
- Long messages. A cold first touch over about 120 words reads as a pitch.
- Multiple calls to action, or a hard meeting ask in a first touch.
- Links and images in a first touch.
- Anything that reads as automated: merge-field leftovers, "Dear Sir/Madam", "I hope this email finds you well".

Rules for your output:
1. Every finding must quote the exact text you object to, verbatim from the email.
2. Every finding must include a concrete replacement — the actual words to use, not advice about what to write.
3. A replacement must preserve the writer's meaning. Do not neuter a sentence to make it safe.
4. If a line is fine, say nothing about it. Do not pad.
5. Never invent a statistic, a customer name, or a claim the original did not make.
6. If the email has no meaningful risk, return an empty findings array. Saying "this is fine" is a valid and useful answer.

Return ONLY minified JSON, no markdown fence:
{"findings":[{"quote":"exact text from the email","replacement":"exact text to use instead","reason":"one short sentence on why the original is risky","severity":"warning"|"critical"}],"summary":"one sentence overall"}`;

export function copyRiskUserPayload(subject: string, body: string, firstTouch: boolean): string {
  return JSON.stringify({
    subject,
    body,
    context: firstTouch
      ? "Cold first touch. No prior relationship. Link-light and short is the bar."
      : "Follow-up in an existing thread. Slightly more latitude on length and links.",
  });
}

/** Shape the function accepts back. Anything else is discarded, not guessed at. */
export interface CopyRiskFinding {
  quote: string;
  replacement: string;
  reason: string;
  severity: "warning" | "critical";
}

/**
 * Parse strictly and drop anything malformed.
 *
 * A finding that quotes text which is not in the email is worse than no
 * finding: the user searches for it, cannot find it, and stops trusting the
 * whole panel. So every quote is verified against the source before it ships.
 */
export function parseCopyRiskFindings(
  raw: unknown,
  source: string,
): { findings: CopyRiskFinding[]; dropped: number } {
  const list = Array.isArray((raw as { findings?: unknown })?.findings)
    ? (raw as { findings: unknown[] }).findings
    : [];

  const findings: CopyRiskFinding[] = [];
  let dropped = 0;

  for (const item of list) {
    const f = item as Partial<CopyRiskFinding>;
    const quote = typeof f.quote === "string" ? f.quote.trim() : "";
    const replacement = typeof f.replacement === "string" ? f.replacement.trim() : "";
    const reason = typeof f.reason === "string" ? f.reason.trim() : "";

    if (!quote || !replacement || !reason) { dropped++; continue; }
    // The quote has to actually be in the email, or the finding is unusable.
    if (!source.includes(quote)) { dropped++; continue; }

    findings.push({
      quote,
      replacement,
      reason,
      severity: f.severity === "critical" ? "critical" : "warning",
    });
  }

  return { findings, dropped };
}
