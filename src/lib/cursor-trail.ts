/**
 * Cursor bookkeeping for paging a lead search.
 *
 * The backend pages by an opaque provider cursor and returns the next one with
 * every response. Nothing in the app used to send or read it, so paging fell
 * back to numeric offsets and stopped at whatever row ceiling the provider
 * imposes — Crustdata refuses past 100.
 *
 * A cursor only ever points forward, so going back a page means remembering the
 * one that fetched it. The trail is that memory: `trail[i]` is the cursor that
 * fetches page `i + 1`, which makes `trail[0]` always null because page one
 * needs none.
 */

/** A fresh trail, positioned before page one. */
export function resetTrail(): (string | null)[] {
  return [null];
}

/**
 * Record the cursor a response handed back.
 *
 * It is stored at index `page` because it fetches the page *after* the one just
 * loaded. Gaps are filled with null so a jump forward cannot leave holes that
 * read as a usable cursor.
 */
export function recordCursor(
  trail: (string | null)[],
  page: number,
  nextCursor: string | null,
): (string | null)[] {
  if (page < 1) return trail;
  const next = [...trail];
  while (next.length < page) next.push(null);
  next[page] = nextCursor;
  return next;
}

/** The cursor that fetches this page, or undefined when there isn't one. */
export function cursorForPage(
  trail: (string | null)[],
  page: number,
): string | undefined {
  return trail[page - 1] ?? undefined;
}

/**
 * Whether another page can actually be fetched.
 *
 * A cursor is the provider stating there is more, so it outranks the row total,
 * which is an estimate and would stop paging early — or invite a request for a
 * page that does not exist.
 */
export function hasNextPage(
  nextCursor: string | null,
  currentPage: number,
  totalPages: number,
): boolean {
  return nextCursor !== null || currentPage < totalPages;
}
