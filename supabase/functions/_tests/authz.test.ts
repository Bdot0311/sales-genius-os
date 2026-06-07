// Authz smoke tests — pings each edge function with NO auth header and asserts
// the response matches the expected public/private posture. This is the safety
// net so a future change can't silently remove a JWT check.
//
// Run via: supabase--test_edge_functions tool, or:
//   deno test --allow-net --allow-env supabase/functions/_tests/authz.test.ts
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

// Functions that MUST reject unauthenticated callers (expect 401/403, or a JSON error)
const PRIVATE_FUNCTIONS = [
  "add-subscription-addon", "admin-create-user", "admin-delete-user",
  "admin-send-reset-email", "agent-run", "ai-coach", "analyze-reply",
  "apply-cloudflare-dns", "build-salesos-network", "calculate-relevance-score",
  "check-subscription", "customer-portal", "delete-sent-emails", "enrich-lead",
  "execute-workflow", "fetch-external-leads", "fetch-google-calendar-events",
  "generate-api-key", "generate-blog-post", "generate-email",
  "generate-followup-suggestion", "get-stripe-revenue", "graphql-api",
  "inbox-sync", "link-agency-client", "parse-lead-query",
  "preview-transactional-email", "process-sequence-step", "purchase-credit-topup",
  "refresh-google-token", "remove-subscription-addon", "replay-webhook",
  "rest-api", "rotate-api-key", "run-webhook-tests", "score-lead",
  "search-prospects", "send-email", "send-push-notification",
  "send-transactional-email", "sync-to-google-calendar", "test-webhook",
  "trigger-webhook", "update-lead-engagement-state", "upload-email-logo",
  "verify-domain", "verify-topup-payment",
];

// Functions that are intentionally public (must NOT return 401 for missing JWT)
const PUBLIC_FUNCTIONS = [
  "auth-email-hook",            // Supabase auth webhook
  "check-signup-eligibility",   // pre-signup
  "create-account-with-subscription", // signup flow
  "create-checkout",            // unauthenticated checkout (per memory)
  "handle-email-unsubscribe",   // public unsubscribe link
  "handle-email-suppression",   // provider webhook
  "llms-txt",                   // marketing
  "notify-new-signup",          // db trigger
  "reset-password",             // public reset
  "send-integration-request",   // public form
  "stripe-webhook",             // Stripe webhook
  "track-email-open",           // 1x1 pixel
  "unsubscribe",                // public link
  "validate-email",             // pre-signup
  // OAuth callbacks
  "google-oauth-callback", "google-oauth-init",
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
    // Acceptable: 401 (unauth), 403 (forbidden), or a JSON body with error/unauthorized text
    const ok = status === 401 || status === 403 ||
      /unauthor|forbidden|access denied|not authenticated|missing.*auth/i.test(body);
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
    const { status } = await call(fn);
    // Public endpoints may 200/400/405/429 — just must not require auth.
    if (status === 401) failures.push(`${fn} → 401 (requires JWT but is documented public)`);
  }
  if (failures.length) console.error("Public functions wrongly require JWT:\n" + failures.join("\n"));
  assert(failures.length === 0, `${failures.length} public functions wrongly require JWT`);
});
