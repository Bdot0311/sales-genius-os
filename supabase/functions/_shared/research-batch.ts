/**
 * A resumed turn was researching the same first 12 leads again.
 *
 * A request that still has unfinished ids stays on those ids. "these 12" and
 * any other named slice stay on the ids in the call. The saved list is used
 * only for a real whole-list ask: wording such as "research them all", or a
 * count that covers every listed lead. "research 20 leads" is a cap, not the
 * pool.
 */
const WHOLE_LIST_WORDING =
  /\b(?:all of them|every lead|the whole list|the entire list|research them all)\b/;

/**
 * The count that belongs to the research ask.
 *
 * "research these 3, then draft 2 leads" is 3. A later number on a different
 * verb is not the cap. When the research phrase names no number, an earlier
 * "63 leads" still counts, which is how "research them" covers a loaded list.
 */
export function explicitResearchCount(message: string): number | null {
  const text = message.toLowerCase();
  const at = text.search(/\bresearch(?:ing)?\b/);
  if (at >= 0) {
    const clause = text.slice(at).split(/\bthen\b|[.;]|\band\s+draft\b/)[0] ?? "";
    const bound = clause.match(/\b(\d+)\b/);
    if (bound) {
      const n = Number(bound[1]);
      if (Number.isInteger(n) && n > 0) return n;
    }
  }
  let count: number | null = null;
  for (const match of text.matchAll(/\b(?:these\s+(\d+)|(\d+)\s+leads)\b/g)) {
    const n = Number(match[1] ?? match[2]);
    if (Number.isInteger(n) && n > 0) count = n;
  }
  return count;
}

export function askedForWholeList(message: string, poolSize = 0): boolean {
  const text = message.toLowerCase();
  if (/\bthese\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(text)) return false;
  if (/\b(?:research|draft)\s+(?:these|those|the)\s+\d+\b/.test(text)) return false;
  if (WHOLE_LIST_WORDING.test(text)) return true;
  const count = explicitResearchCount(message);
  if (count == null) return false;
  // Once the list is loaded, the count is the whole list only when it covers it.
  // Before that, "research all 63 leads" is still a whole-list ask. "20 leads" is not.
  if (poolSize > 0) return count >= poolSize;
  return /\ball\s+\d+\s+leads\b/.test(text);
}

/**
 * Walk the saved list only when this ask is the whole list.
 *
 * A finished 12-id slice used to count on its own, so "research these 12"
 * queued every other lead in the pool.
 */
export function continuesListedBatch(input: {
  requested: string[];
  pool: string[];
  limit: number;
  wholeList: boolean;
}): boolean {
  return input.wholeList === true
    && input.pool.length > 0
    && input.requested.length > 0
    && input.limit > 0;
}

export function researchContinueLine(researched: number, wholeList: boolean): string {
  if (researched <= 0) return "";
  if (wholeList) {
    return `${researched} leads were already researched this run. Call research_leads with the full list; it skips those and takes the next unprocessed leads, not the same 12. `;
  }
  return `${researched} leads from that request were already researched. Do not call research_leads again for them. Draft those, or pass only ids that still need research. `;
}

export function nextResearchSlice(input: {
  requested: string[];
  done: string[];
  pool: string[];
  limit: number;
  wholeList?: boolean;
  /**
   * Ceiling for the run, including ids already in `done` (researched or
   * queued). Absent means the ask did not name a count.
   */
  cap?: number | null;
}): { inline: string[]; queue: string[] } {
  const done = new Set(input.done.filter(Boolean));
  const requested = input.requested.filter(Boolean);
  const fresh = requested.some((id) => !done.has(id));
  const allDone = requested.length > 0 && requested.every((id) => done.has(id));
  const source = fresh
    ? requested
    : allDone && continuesListedBatch({
      requested,
      pool: input.pool,
      limit: input.limit,
      wholeList: input.wholeList === true,
    })
      ? input.pool
      : [];
  const seen = new Set<string>();
  const pending: string[] = [];
  for (const id of source) {
    if (!id || done.has(id) || seen.has(id)) continue;
    seen.add(id);
    pending.push(id);
  }
  const capped = capRoom(input.cap, done.size);
  const within = capped == null ? pending : pending.slice(0, capped);
  const limit = Math.max(0, input.limit);
  return { inline: within.slice(0, limit), queue: within.slice(limit) };
}

/** How many more leads this run may research. Null when the ask has no count. */
function capRoom(cap: number | null | undefined, already: number): number | null {
  if (typeof cap !== "number" || !Number.isFinite(cap)) return null;
  return Math.max(0, Math.floor(cap) - Math.max(0, already));
}
