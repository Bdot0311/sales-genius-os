/**
 * The message an edge function actually sent, rather than the transport's.
 *
 * `supabase.functions.invoke` resolves with an `error` whose message is
 * "Edge Function returned a non-2xx status code" for every failure, and puts
 * the function's own response — the one carrying the reason — on
 * `error.context`, unread. Code that does `if (error) throw error` therefore
 * shows the user the one sentence that is identical for a missing server
 * secret, an expired session and a malformed request.
 *
 * That is how a Google connection failure stayed unexplained for days: the
 * function knew which of those it was and said so, and the client threw it
 * away before anybody saw it.
 */

/** A FunctionsHttpError, which carries the real response on `context`. */
function responseFrom(error: unknown): Response | null {
  const ctx = (error as { context?: unknown } | null)?.context;
  return ctx instanceof Response ? ctx : null;
}

/**
 * Reads the function's own error out of a failed invoke.
 *
 * Falls back to the transport message only when there is nothing better, so a
 * genuine network failure still says something, and never returns an empty
 * string.
 */
export async function edgeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const response = responseFrom(error);
  if (response) {
    // The body can only be read once, so every read works on a clone:
    // callers may still want the status or the code.
    let parsedAsJson = false;
    try {
      const body = await response.clone().json();
      parsedAsJson = true;
      const message = typeof body?.error === "string" ? body.error.trim() : "";
      if (message) return message;
    } catch {
      // Not JSON. The raw text may still say something.
    }
    /*
     * Only when the body was NOT json. A JSON body that parsed but carried no
     * usable `error` has already said all it is going to; falling through
     * here returned the literal text `{}` to the user, which is worse than
     * the fallback because it looks like an answer.
     */
    if (!parsedAsJson) {
      try {
        const text = (await response.clone().text()).trim();
        if (text && !text.startsWith("<")) return text.slice(0, 300);
      } catch {
        // Nothing readable.
      }
    }
  }
  const transport = error instanceof Error ? error.message.trim() : "";
  /*
   * The transport sentence is worse than useless on its own — it is what the
   * user has been shown all along — so it is only used when the function said
   * nothing at all, and the fallback explains what was being attempted.
   */
  if (transport && !/non-2xx status code/i.test(transport)) return transport;
  return fallback;
}

/** The `error_code` an edge function sent, when it sent one. */
export async function edgeErrorCode(error: unknown): Promise<string | null> {
  const response = responseFrom(error);
  if (!response) return null;
  try {
    const body = await response.clone().json();
    return typeof body?.error_code === "string" ? body.error_code : null;
  } catch {
    return null;
  }
}
