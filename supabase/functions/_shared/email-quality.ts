// One quality verdict, shared by everything that writes an email.
//
// check-email-rubric already existed and scored well, but nothing that
// generated or sent email called it: not generate-email, not agent-run, not
// agent-chat, not agent-approvals, not send-email. It ran only from the
// Outreach Studio panel and from generate-sequence, which means a draft was
// scored only if a human happened to be looking at it. The AI SDR sent
// unscored email to real prospects.
//
// Routing every caller through here is what makes the checker and the panel
// agree: one request shape, one threshold, one definition of "weak".

export interface RubricDimension {
  score: number; // 0-5, as returned by check-email-rubric
  justification: string;
}

export interface RubricResult {
  dimensions: Record<string, RubricDimension>;
  suggestions: { snippet: string; dimension: string; suggestion: string }[];
  weakest: string | null;
  /** Dimension average rescaled to 0-100, so it reads like every other score in the product. */
  overall: number;
}

/**
 * Below this the draft is treated as not worth sending as-is.
 *
 * 60 is an average of 3 out of 5 across the rubric's dimensions — the point
 * where the rubric's own language stops being "good" and starts being "needs
 * work". Deliberately not stricter: this gates the autonomous agent, and a
 * threshold that rejects competent email would just stall the pipeline.
 */
export const WEAK_SCORE = 60;

export function overallScore(dimensions: Record<string, RubricDimension>): number {
  const scores = Object.values(dimensions ?? {}).map((d) => Number(d?.score) || 0);
  if (!scores.length) return 0;
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 20);
}

/**
 * Score a draft, or return null when no verdict is available.
 *
 * Null is not a failure to handle loudly — the rubric is plan-gated to growth
 * and above, and callers must not block a starter user's email because their
 * plan cannot reach the scorer. Every failure mode (missing plan, provider
 * down, unparseable output) collapses to null, and callers treat null as
 * "unscored" rather than "bad".
 */
export async function scoreEmail(
  supabaseUrl: string,
  authHeader: string,
  apikey: string,
  input: { subject?: string; body: string },
): Promise<RubricResult | null> {
  if (!input.body?.trim()) return null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/check-email-rubric`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader, apikey },
      body: JSON.stringify({ subject: input.subject ?? "", body: input.body }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    // The function answers 200 with an error_code for soft failures, and is
    // explicitly fail-closed: it never fabricates a score. Respect that here.
    if (!data || data.error || !data.dimensions) return null;
    return {
      dimensions: data.dimensions,
      suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      weakest: typeof data.weakest === "string" ? data.weakest : null,
      overall: overallScore(data.dimensions),
    };
  } catch {
    return null;
  }
}

/** True only when a real score came back and it is below the bar. */
export function isWeak(rubric: RubricResult | null): boolean {
  return !!rubric && rubric.overall < WEAK_SCORE;
}

/**
 * The rubric's own findings as a rewrite instruction.
 *
 * Used when a draft scores weak and is being regenerated: telling the model
 * what the scorer objected to is what makes the second attempt different from
 * the first, rather than another roll of the same dice.
 */
export function rubricFeedback(rubric: RubricResult): string {
  const weak = Object.entries(rubric.dimensions)
    .filter(([, d]) => Number(d?.score) <= 3)
    .map(([name, d]) => `- ${name} (${d.score}/5): ${d.justification}`);
  const fixes = rubric.suggestions.slice(0, 3).map((s) => `- "${s.snippet}" → ${s.suggestion}`);
  return [
    "",
    `A quality rubric scored the previous draft ${rubric.overall}/100, below the bar for sending.`,
    weak.length ? `It marked these down:\n${weak.join("\n")}` : "",
    fixes.length ? `Specific rewrites it asked for:\n${fixes.join("\n")}` : "",
    "Write a new email that fixes these. Do not simply reword the previous one.",
  ].filter(Boolean).join("\n");
}

/**
 * The bar the autonomous agent writes to.
 *
 * WEAK_SCORE is a floor for a human's draft: below it, a person is told the
 * email needs work and can go and fix it. The agent has nobody to tell. It
 * writes, it sends, and the first human to read the copy is the prospect — so
 * the only place a weak draft can be caught is inside the agent's own loop.
 *
 * 100 is 5/5 on all five R.E.P.L.Y. dimensions. It is deliberately the top of
 * the scale rather than a comfortable 80: the agent is not tired, it can write
 * the email again, and an attempt that costs a few seconds is cheaper than a
 * mediocre email spent against a prospect who only gets contacted once.
 */
export const AGENT_TARGET_SCORE = 100;

/**
 * How many times the agent may rewrite before it gives up and holds the draft.
 *
 * Every attempt is a generation plus a scoring call, so this is the cost
 * ceiling as much as the quality one. Four is where the returns flatten in
 * practice: the rubric's objections are specific, so most of the gain arrives
 * on the second and third attempt, and an attempt that has not fixed anything
 * by the fourth is usually blocked by missing facts about the lead rather than
 * by the writing.
 */
export const AGENT_MAX_ATTEMPTS = 4;

export interface Attempt {
  subject: string;
  body: string;
  rubric: RubricResult | null;
  /** Deterministic findings that would stop a send: blockers and warnings. */
  blocking: { rule: string; severity: string; why: string; fix: string }[];
}

/** True when this draft is clean on both checks: 100 on the rubric, nothing blocking. */
export function isPerfect(a: Attempt): boolean {
  return (a.rubric?.overall ?? 0) >= AGENT_TARGET_SCORE && a.blocking.length === 0;
}

/**
 * Rank two attempts. Higher rubric score wins; ties break on fewer findings.
 *
 * A rewrite is not automatically an improvement, and the agent keeps whichever
 * attempt actually came out better rather than the most recent one.
 */
export function better(a: Attempt, b: Attempt | null): boolean {
  if (!b) return true;
  const as = a.rubric?.overall ?? 0;
  const bs = b.rubric?.overall ?? 0;
  if (as !== bs) return as > bs;
  return a.blocking.length < b.blocking.length;
}

/**
 * Everything wrong with an attempt, as one instruction for the next one.
 *
 * Both halves matter and they fail differently. The rubric is a model's opinion
 * about whether the email earns a reply; the audit is a set of things that are
 * simply true or false about the text — a banned phrase, an unfilled
 * placeholder, a company name that does not match the lead row. Telling the
 * writer only about the first leaves it rewriting good sentences around a
 * misspelled company name.
 */
export function attemptFeedback(a: Attempt): string {
  const parts: string[] = [];
  if (a.rubric && a.rubric.overall < AGENT_TARGET_SCORE) {
    const short = Object.entries(a.rubric.dimensions)
      .filter(([, d]) => Number(d?.score) < 5)
      .map(([name, d]) => `- ${name} (${d.score}/5): ${d.justification}`);
    const fixes = a.rubric.suggestions.slice(0, 3).map((s) => `- "${s.snippet}" → ${s.suggestion}`);
    parts.push(
      `A quality rubric scored the previous draft ${a.rubric.overall}/100. It has to reach ${AGENT_TARGET_SCORE}.`,
      short.length ? `Dimensions below 5 out of 5:\n${short.join("\n")}` : "",
      fixes.length ? `Specific rewrites it asked for:\n${fixes.join("\n")}` : "",
    );
  }
  if (a.blocking.length) {
    parts.push(
      `A rule check found ${a.blocking.length} problem${a.blocking.length === 1 ? "" : "s"} that stop this sending:`,
      a.blocking.map((f) => `- ${f.rule}: ${f.why} Fix: ${f.fix}`).join("\n"),
    );
  }
  parts.push("Write a new email that fixes all of the above. Do not simply reword the previous one.");
  return "\n" + parts.filter(Boolean).join("\n");
}
