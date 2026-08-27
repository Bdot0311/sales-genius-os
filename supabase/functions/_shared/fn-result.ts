/**
 * Turn an edge-function HTTP response into a result object, treating the
 * status code as authoritative.
 *
 * Callers across these functions decide success with `!r?.error`. The helpers
 * that produced `r` parsed the response body and ignored `res.ok`, so any
 * failure whose body did not happen to use the key "error" was read as a
 * success. Supabase platform errors are `{code:"BOOT_ERROR", message}`,
 * worker-limit 546s and gateway 5xx carry their own shapes, and a proxy
 * timeout returns whatever the proxy writes. None of them have an "error" key.
 *
 * For send-email that meant a failed send set failed=false, wrote an
 * "outreach_sent" row into agent_actions, marked the approval approved, and
 * the chat reported a send that never left the building.
 */
export function asFnResult(
  name: string,
  status: number,
  ok: boolean,
  text: string,
): Record<string, unknown> {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const asObject = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;

  if (!ok) {
    // Prefer whatever the body called the problem, so the real cause survives
    // into the message the user is shown.
    const detail =
      (typeof asObject?.error === "string" ? asObject.error : "") ||
      (typeof asObject?.message === "string" ? asObject.message : "") ||
      text.slice(0, 300);
    return {
      ...(asObject ?? {}),
      error: detail || `${name} failed with HTTP ${status}`,
      http_status: status,
    };
  }

  if (asObject) return asObject;
  // A 2xx carrying nothing actionable is not a success anyone can report.
  return { error: text.slice(0, 300) || `${name} returned an empty response` };
}
