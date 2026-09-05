/**
 * How the reply rubric is shown, as opposed to what it scores.
 *
 * The panel could not display a good email. check-email-rubric always returns
 * a `weakest` dimension - its reduce starts from DIMS[0] and keeps the first on
 * a tie, so five identical scores still name one - and the bar painter treated
 * `weakest` as red whatever the number behind it. A draft scoring 5/5 across
 * the board therefore rendered one red bar labelled "weakest".
 *
 * So "get them all green" was not a hard target, it was an unreachable one, and
 * the panel looked broken because in that respect it was.
 *
 * Two rules fix it. A score is coloured by the score. A dimension is only
 * called weakest when it is genuinely the weak one: the unique lowest, and low
 * enough to be worth acting on.
 */

export interface RubricDim {
  score: number;
  justification?: string;
}

/** At or above this, a dimension is doing its job and is not "the problem". */
export const STRONG_SCORE = 4;

/** Colour follows the score, and nothing else. */
export function barColorFor(score: number): string {
  if (score >= STRONG_SCORE) return "bg-green-500";
  if (score >= 3) return "bg-yellow-500";
  if (score >= 2) return "bg-orange-500";
  return "bg-destructive";
}

/**
 * The one dimension worth fixing next, or null when there is not one.
 *
 * Null in two cases that both used to render as a red bar: everything is
 * already strong, and several dimensions are tied at the bottom. A tie has no
 * single weakest, and picking the first and painting it red tells the user
 * something that is not true.
 */
export function weakestDimension(dims: Record<string, RubricDim> | null | undefined): string | null {
  if (!dims) return null;
  const entries = Object.entries(dims).filter(([, d]) => typeof d?.score === "number");
  if (entries.length === 0) return null;

  const lowest = Math.min(...entries.map(([, d]) => d.score));
  if (lowest >= STRONG_SCORE) return null; // nothing here is holding the email back

  const atLowest = entries.filter(([, d]) => d.score === lowest);
  if (atLowest.length !== 1) return null; // a tie has no single weakest
  return atLowest[0][0];
}

/** True when every dimension is at or above the bar. */
export function allStrong(dims: Record<string, RubricDim> | null | undefined): boolean {
  if (!dims) return false;
  const scores = Object.values(dims)
    .map((d) => d?.score)
    .filter((s): s is number => typeof s === "number");
  return scores.length > 0 && scores.every((s) => s >= STRONG_SCORE);
}

/**
 * A suggestion's identity, independent of its position in the array.
 *
 * applied and dismissed were sets of array indices, and the array is replaced
 * every time the rubric re-scores - which applying a suggestion causes, because
 * it edits the body. So the "applied" badge vanished a second later, and index
 * 2 was now a different suggestion wearing the state of the old one. Both
 * halves of that read to the user as the button not working.
 */
export function suggestionKey(s: { dimension?: string; snippet?: string; suggestion?: string }): string {
  return [s.dimension ?? "", s.snippet ?? "", s.suggestion ?? ""].join(" ");
}

/**
 * Suggestions that came back after the user applied them.
 *
 * Worth saying out loud rather than silently re-offering: the rubric looked at
 * the rewritten draft and still wants this changed, so the apply did not move
 * the thing it was aimed at. Silently showing the same row with a fresh button
 * is what made "some don't really change anything" impossible to tell apart
 * from "the button is broken".
 */
export function unresolvedAfterApply(
  suggestions: { dimension?: string; snippet?: string; suggestion?: string }[],
  appliedKeys: ReadonlySet<string>,
): string[] {
  return suggestions.map(suggestionKey).filter((k) => appliedKeys.has(k));
}
