/**
 * A resumed turn was researching the same first 12 leads again.
 *
 * research_leads only accepts 12 ids, and the model passes the head of the
 * list it just fetched. Leads already researched this run are skipped, and
 * the next unprocessed ids from that list are what the turn works on. Anything
 * past the inline cap is queued instead of dropped.
 */
export function nextResearchSlice(input: {
  requested: string[];
  done: string[];
  pool: string[];
  limit: number;
}): { inline: string[]; queue: string[] } {
  const done = new Set(input.done.filter(Boolean));
  const seen = new Set<string>();
  const pending: string[] = [];
  const add = (id: string) => {
    if (!id || done.has(id) || seen.has(id)) return;
    seen.add(id);
    pending.push(id);
  };
  for (const id of input.requested) add(id);
  // The caller asked only for leads this run already finished. Continue
  // through the list from the last lookup instead of repeating them.
  if (pending.length === 0) {
    for (const id of input.pool) add(id);
  } else {
    for (const id of input.pool) add(id);
  }
  const limit = Math.max(0, input.limit);
  return { inline: pending.slice(0, limit), queue: pending.slice(limit) };
}
