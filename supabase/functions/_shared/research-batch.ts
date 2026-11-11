/**
 * A resumed turn was researching the same first 12 leads again.
 *
 * A request that still has unfinished ids stays on those ids. Repeating a
 * smaller set ("these 3") does not fan out across the saved list. The saved
 * list is used only when this call is a full inline batch from that list, or
 * the user asked for the whole list.
 */
export function askedForWholeList(message: string): boolean {
  const text = message.toLowerCase();
  if (/\bthese\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(text)) return false;
  if (/\b(?:research|draft)\s+(?:these|those|the)\s+\d+\b/.test(text)) return false;
  return /\b(?:all of them|every lead|the whole list|the entire list)\b/.test(text)
    || /\b\d{2,}\s+leads\b/.test(text);
}

/** A repeat of a 12-id slice of the saved list, or an explicit whole-list ask. */
export function continuesListedBatch(input: {
  requested: string[];
  pool: string[];
  limit: number;
  wholeList: boolean;
}): boolean {
  if (input.wholeList) return true;
  if (input.requested.length !== input.limit || input.limit <= 0) return false;
  const poolIds = new Set(input.pool);
  return input.requested.every((id) => poolIds.has(id));
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
  const limit = Math.max(0, input.limit);
  return { inline: pending.slice(0, limit), queue: pending.slice(limit) };
}
