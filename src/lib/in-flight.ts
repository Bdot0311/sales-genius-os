/**
 * Coalescing for requests that cost money.
 *
 * A search and a reveal are both billed per call, so asking the same question
 * twice at the same time is charged twice. The UI already disables its buttons
 * while one is running, but `disabled` is a render away from the click that set
 * it, and some flows do async work *before* the call that flips the flag — the
 * describe tab parses the query with an LLM first, which leaves seconds where
 * the button is live and nothing is marked busy.
 *
 * So the guard cannot live in a button. Two callers that ask the same question
 * while the first is still in flight share the first answer here instead.
 *
 * The backend coalesces too, which makes this belt and braces on purpose: this
 * saves the request, and the backend catches whatever reaches it anyway.
 */

/**
 * A stable string for a request body.
 *
 * Object key order is whatever the code that built the body happened to use, so
 * two identical requests can serialise differently. Sorting the keys at every
 * level is what makes "the same question" a comparable value.
 */
export function requestKey(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    // Undefined is dropped rather than sorted: `{a: 1}` and `{a: 1, b: undefined}`
    // are the same request, and JSON.stringify already omits the second key.
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) out[key] = canonical(source[key]);
    }
    return out;
  }
  return value;
}

/**
 * Runs `work` unless an identical call is already running, in which case the
 * caller joins that one.
 *
 * The entry is removed when the work settles, so a repeat *after* it finishes
 * runs again — this deduplicates concurrent calls, it does not cache. A search
 * re-run a minute later is a real request the user asked for.
 *
 * A rejection is shared with every joined caller and then forgotten, so a
 * failure never sticks to the key.
 */
export function coalesce<T>(
  pending: Map<string, Promise<T>>,
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const running = pending.get(key);
  if (running) return running;

  // The entry has to be recorded before anything can await, or two callers in
  // the same tick both look and both miss.
  const promise = (async () => work())().finally(() => {
    // Only clear our own entry. A later call that already replaced it is the
    // one now in flight, and deleting it would let a third call run alongside.
    if (pending.get(key) === promise) pending.delete(key);
  });
  pending.set(key, promise);
  return promise;
}
