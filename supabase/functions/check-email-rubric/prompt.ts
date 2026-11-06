// R.E.P.L.Y. rubric prompt for Email Quality Checker v2. Version-controlled
// because this is the scoring contract the Phase 4 generator is built against.
// The model scores five dimensions 0-5 with a one-line justification each and
// returns line-anchored suggestions. It never rewrites the user's email; it
// only scores and suggests. Called at temperature 0 for stable scores.

export const RUBRIC_SYSTEM_PROMPT = `You score a cold outbound email against the R.E.P.L.Y. rubric. You do not rewrite the email. You score it and suggest edits the user can accept or ignore.

Score each dimension 0 to 5 (5 is best) with one short plain-English justification:
- relevance: is there a specific, verifiable reason this email is going to this exact person, not a generic segment
- empathy: does it name a problem in the reader's language rather than describing the sender's product
- payoff: does the reader get something useful from the email itself even if they never reply
- low_friction_ask: is the call to action small, specific, and answerable in one line
- you_focused: is the language oriented to the reader rather than the sender

Also return up to 5 suggestions. Each suggestion names the exact snippet it applies to (copy it verbatim from the email so the UI can locate it), the dimension it improves, and a one-line suggested change. Suggest, do not rewrite the whole email.

Copy style for every justification and suggestion string: lowercase-first, plain and direct, no em-dashes, no exclamation points, no hype, at most one sentence. Do not invent facts about the prospect.

Each score is one integer, 0, 1, 2, 3, 4, or 5. Do not write a range.

Return only this JSON:
{
  "dimensions": {
    "relevance": {"score": 4, "justification": "..."},
    "empathy": {"score": 4, "justification": "..."},
    "payoff": {"score": 4, "justification": "..."},
    "low_friction_ask": {"score": 4, "justification": "..."},
    "you_focused": {"score": 4, "justification": "..."}
  },
  "suggestions": [
    {"snippet": "<verbatim text from the email>", "dimension": "relevance|empathy|payoff|low_friction_ask|you_focused", "suggestion": "<one line>"}
  ]
}`;

export function rubricUserPayload(subject: string, body: string): string {
  return `Subject: ${subject}\n\nBody:\n${body}`;
}

/**
 * A dimension score, or null when the model did not give one.
 *
 * The prompt used to show `"score": 0-5` as the schema. Models copy that
 * token. `Number("0-5")` is NaN, and `NaN || 0` stored a zero, so every bar
 * rendered as a failure. A range is not a score. "4/5" is.
 */
export function parseDimensionScore(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const score = Math.round(raw);
    return score >= 0 && score <= 5 ? score : null;
  }
  if (typeof raw !== "string") return null;
  const match = raw.trim().match(/^([0-5])(?:\s*\/\s*5)?$/);
  if (!match) return null;
  return Number(match[1]);
}
