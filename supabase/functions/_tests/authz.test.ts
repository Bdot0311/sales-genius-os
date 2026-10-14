// Authz smoke tests — pings each edge function with NO auth header and asserts
// the response matches the expected public/private posture. This is the safety
// net so a future change can't silently remove a JWT check.
//
// Run via: supabase--test_edge_functions tool, or:
//   deno test --allow-net --allow-env supabase/functions/_tests/authz.test.ts
import { loadSync } from "https://deno.land/std@0.224.0/dotenv/mod.ts";

// dotenv/load.ts asserts every key listed in .env.example is present, which no
// preview sandbox satisfies (Turnstile, Stripe's publishable key, Railway and
// the queue-concurrency knob all live elsewhere). This test only needs the
// Supabase URL and key, so load .env without that example-file check.
loadSync({ examplePath: null, export: true });
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

// Functions that MUST reject unauthenticated callers (expect 401/403, or a JSON error)
const PRIVATE_FUNCTIONS = [
  "add-subscription-addon", "admin-create-user", "admin-delete-user",
  "admin-send-reset-email", "agent-run", "ai-coach", "analyze-reply",
  "apply-cloudflare-dns", "build-salesos-network", "calculate-relevance-score",
  "check-subscription", "customer-portal", "delete-sent-emails", "enrich-lead",
  "fetch-external-leads", "fetch-google-calendar-events",
  "generate-api-key", "generate-blog-post", "generate-email",
  "generate-followup-suggestion", "get-stripe-revenue",
  "inbox-sync", "link-agency-client", "parse-lead-query",
  "preview-transactional-email", "process-sequence-step", "purchase-credit-topup",
  "queue-draft-batch",
  "refresh-google-token", "remove-subscription-addon", "replay-webhook",
  "research-lead",
  "rest-api", "rotate-api-key", "run-webhook-tests", "score-lead",
  "search-prospects", "send-email", "send-push-notification",
  "sync-to-google-calendar", "test-webhook",
  "trigger-webhook", "update-lead-engagement-state", "upload-email-logo",
  "verify-domain", "verify-topup-payment",
  // Guarded by requireServiceRole in the handler, not by a user session: the
  // caller is a database trigger or an admin flow, and an anonymous ping must
  // not reach the Stripe lookup behind any of them.
  "check-signup-eligibility", "create-account-with-subscription",
  "notify-new-signup", "google-oauth-init",
];

// Functions that are intentionally public (must NOT return 401 for missing JWT)
const PUBLIC_FUNCTIONS = [
  "auth-email-hook",            // Supabase auth webhook (signature-gated inside)
  "create-checkout",            // unauthenticated checkout (per memory)
  "handle-email-events",        // Lovable email events webhook (signed, not JWT)
  "llms-txt",                   // marketing
  "reset-password",             // public reset
  "send-integration-request",   // public form
  "stripe-webhook",             // Stripe webhook
  "track-email-open",           // 1x1 pixel
  "unsubscribe",                // public link
  "validate-email",             // pre-signup
  // OAuth callbacks — the *callback* lands without a session; the *init* needs
  // the signed-in user's token and is listed as private.
  "google-oauth-callback",
  "hubspot-oauth-callback", "hubspot-oauth-init",
  "salesforce-oauth-callback", "salesforce-oauth-init",
  "calendly-oauth-callback", "calendly-oauth-init",
  "slack-oauth-callback", "slack-oauth-init",
];

async function call(fn: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, ...headers },
    body: JSON.stringify({ __authz_test: true }),
  });
  const body = await res.text();
  return { status: res.status, body };
}

Deno.test("private edge functions reject anonymous callers", async () => {
  const failures: string[] = [];
  for (const fn of PRIVATE_FUNCTIONS) {
    const { status, body } = await call(fn);
    // Acceptable: 401 (unauth), 403 (forbidden), or a JSON body that says so.
    // The wording is not uniform across handlers — "Authentication required"
    // comes from _shared/internal-auth.ts, "No authorization header" from the
    // older handlers — so every refusal phrase in use is matched here.
    const ok = status === 401 || status === 403 ||
      /unauthor|forbidden|access denied|not authenticated|authentication required|authorization header/i.test(body);
    if (!ok) failures.push(`${fn} → ${status} ${body.slice(0, 120)}`);
  }
  if (failures.length) {
    console.error("Private functions accepting anon:\n" + failures.join("\n"));
  }
  assert(failures.length === 0, `${failures.length} private functions accept anonymous requests`);
});

Deno.test("public edge functions remain reachable without JWT", async () => {
  const failures: string[] = [];
  for (const fn of PUBLIC_FUNCTIONS) {
    const { status, body } = await call(fn);
    // A public endpoint may still refuse this caller — a webhook without its
    // signature, a form without its fields. What it must not do is be stopped
    // by the platform's JWT gate, whose entire reply is {"error":"Unauthorized"}
    // or {"error":"Invalid JWT"}. Anything more specific came from the function
    // itself, which means the request reached it.
    const blockedByJwtGate = status === 401 &&
      /^\s*\{\s*"error"\s*:\s*"(Unauthorized|Invalid JWT[^"]*)"\s*\}\s*$/.test(body);
    if (blockedByJwtGate) failures.push(`${fn} → 401 ${body.slice(0, 80)}`);
  }
  if (failures.length) console.error("Public functions wrongly require JWT:\n" + failures.join("\n"));
  assert(failures.length === 0, `${failures.length} public functions wrongly require JWT`);
});
