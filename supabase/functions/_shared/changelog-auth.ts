/**
 * Who may draft a changelog entry.
 *
 * A dedicated secret rather than the shared INTERNAL_TRIGGER_SECRET, because
 * the caller here is a GitHub Actions workflow and the credential therefore
 * lives in a repository secret — readable by every workflow in the repo and
 * usable by anyone with write access to it.
 *
 * That shared secret authorises sixteen functions, among them
 * dispatch-sequence-steps, process-scheduled-emails, send-re-engagement-emails
 * and send-churn-interview-emails: the ones that send mail to customers, and
 * lock-expired-trials, which changes what they can do. Handing all of that to
 * CI to write a changelog entry is a trade with nothing on the other side of
 * it, so this function takes a key that unlocks only this function.
 *
 * The service-role key is still accepted, so the endpoint can be exercised by
 * hand without inventing a second path for testing.
 */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Constant-time comparison.
 *
 * A bearer token check that returns as soon as two bytes differ leaks the
 * position of the first mismatch through timing. Cheap to avoid.
 */
function sameSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function requireChangelogCaller(req: Request): Response | null {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const dedicated = Deno.env.get("CHANGELOG_DRAFT_SECRET") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  // Both comparisons run against a non-empty configured value. An unset secret
  // must never turn an empty Authorization header into a valid one.
  const ok = sameSecret(token, dedicated) || sameSecret(token, serviceKey);
  if (ok) return null;

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
