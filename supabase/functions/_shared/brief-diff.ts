/**
 * What changed on a prospect's site since the last time we looked.
 *
 * This is the strongest opener material the product can produce, and it costs
 * nothing to obtain: every brief is stored on the lead, and the research step
 * already reads the old one before overwriting it. The comparison was simply
 * never made.
 *
 * Why it beats everything else in the brief. A cold open lives or dies on "why
 * are you writing to me today", and a plain observation cannot answer that —
 * a website is a standing document, so "you position around compliance" was
 * equally true last year. Even a dated observation only answers it when the
 * page happens to state a date. A DIFFERENCE answers it by construction: this
 * was not on their site three weeks ago and it is now. The date is not
 * something we read off the page and hope is current; it is a property of when
 * we looked.
 *
 * Removals matter as much as additions, and are the half nobody instruments.
 * A pricing tier that disappeared, a customer logo that came down, a job
 * posting that closed — each is a real event at that account, and none of them
 * shows up anywhere in a fresh scrape.
 *
 * Everything here is pure so the matching rules are testable. The storage is
 * a field inside the existing research_brief JSON: no column, so no migration,
 * so no window where deployed code reads something the live schema lacks.
 */

import { contentWords } from "./grounding.ts";

export interface BriefChanges {
  /** Observations present now and absent from the previous brief. */
  added: string[];
  /** Observations present before and gone now. */
  removed: string[];
  /** When the brief being compared against was taken. */
  since: string;
  /** Whole days between the two looks, when both are dated. */
  days: number | null;
}

/**
 * Whether two observations are the same fact.
 *
 * Not string equality: the brief is model-written, so the same fact comes back
 * differently worded every scrape and a literal comparison would report the
 * entire brief as new every single time — which is worse than reporting
 * nothing, because it would manufacture a "they just changed this" opener for
 * a page that has not moved in two years.
 *
 * Content-word overlap, measured against the shorter of the two so that a fact
 * restated at greater length still matches the terse version of itself.
 */
export function sameFact(a: string, b: string, threshold = 0.6): boolean {
  const wordsA = new Set(contentWords(a));
  const wordsB = new Set(contentWords(b));
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let shared = 0;
  for (const word of wordsA) if (wordsB.has(word)) shared++;
  return shared / Math.min(wordsA.size, wordsB.size) >= threshold;
}

interface BriefLike {
  observations?: { fact?: string }[] | null;
}

/** The facts in a brief, as plain strings. */
function factsOf(brief: BriefLike | null | undefined): string[] {
  return (brief?.observations ?? [])
    .map((o) => String(o?.fact ?? "").trim())
    .filter(Boolean);
}

/**
 * The difference between the brief we had and the one we just took.
 *
 * Returns null when there is nothing worth saying — no previous brief (the
 * first look at an account is not a change), or the two are the same. A caller
 * that gets null must not tell the writer anything changed.
 */
export function diffBriefs(
  previous: BriefLike | null | undefined,
  next: BriefLike | null | undefined,
  opts: { previousAt?: string | null; now?: Date } = {},
): BriefChanges | null {
  const before = factsOf(previous);
  const after = factsOf(next);
  // The first look at an account establishes the baseline. Nothing about it is
  // news, and saying otherwise would put "I noticed you just..." in front of a
  // prospect on the strength of never having looked before.
  if (before.length === 0) return null;

  const added = after.filter((fact) => !before.some((old) => sameFact(old, fact)));
  const removed = before.filter((fact) => !after.some((now) => sameFact(now, fact)));
  if (added.length === 0 && removed.length === 0) return null;

  const now = opts.now ?? new Date();
  const previousAt = opts.previousAt ?? "";
  const parsed = previousAt ? Date.parse(previousAt) : NaN;
  const days = Number.isFinite(parsed)
    ? Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000))
    : null;

  return {
    added: added.slice(0, 5),
    removed: removed.slice(0, 5),
    since: previousAt,
    days,
  };
}

/**
 * How a change is described to the email writer.
 *
 * Phrased as what we can and cannot say about it. The temptation a model has
 * with a diff is to assert the timing precisely — "you launched this last
 * week" — when all we know is that it appeared between two scrapes, which may
 * be a fortnight apart. So the window is stated and overclaiming it is
 * forbidden in the same breath.
 */
export function changesPromptLines(changes: BriefChanges | null | undefined): string[] {
  if (!changes) return [];
  const lines: string[] = [];
  const window = changes.days === null
    ? "since we last looked"
    : changes.days === 0
    ? "today"
    : changes.days === 1
    ? "in the last day"
    : `in the last ${changes.days} days`;

  for (const fact of changes.added) {
    lines.push(`- NEW ${window} — was not on their site before: ${fact}`);
  }
  for (const fact of changes.removed) {
    lines.push(`- GONE ${window} — was on their site before and has been taken down: ${fact}`);
  }
  if (lines.length) {
    lines.push(
      `- These changes are the strongest opener material available and the only material here whose timing is certain. ` +
        `Lead with one of them. You may say it is recent; you may NOT say exactly when it happened, ` +
        `name a date, or claim you saw it announced — all that is known is that it appeared or disappeared ${window}.`,
    );
  }
  return lines;
}
