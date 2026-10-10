import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Smoke test for the signup + token-refresh regression:
 * a broken provisioning trigger (or a bad subscriptions constraint) surfaces
 * as HTTP 500 from /auth/v1/signup and /auth/v1/token.
 *
 * Runs against the live backend using the publishable (anon) key only.
 * Skipped automatically when the env is unavailable.
 *
 * ── Why the signup half is opt-in ────────────────────────────────────────
 *
 * It does not simulate a signup. It creates a real one: a row in auth.users
 * and everything the provisioning trigger hangs off it, permanently, with no
 * way to clean up from here because the test deliberately holds the anon key
 * and nothing stronger.
 *
 * The publishable key and project URL live in a committed .env, which is
 * correct for a Vite app and means this ran for everyone — CI on every commit,
 * Lovable, and anyone who cloned the repo and typed `vitest run`. Each run left
 * an account behind and fired a "🎉 New User Signup" at the admin inbox.
 *
 * notify-new-signup now drops anything from a reserved test domain, so the
 * email and the analytics event are gone either way. The accounts are not:
 * only running it on purpose stops those. Set RUN_LIVE_SIGNUP_SMOKE=1 to run
 * it, which is worth doing against a migration that touches the trigger, the
 * profiles table or the subscriptions constraint.
 *
 * The refresh half creates nothing — it posts a refresh token that was never
 * valid — so it stays on whenever credentials are present, which keeps the 500
 * on /auth/v1/token guarded on every commit.
 */

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const envFile = path.resolve(__dirname, "../../.env");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const ANON_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const enabled = Boolean(SUPABASE_URL && ANON_KEY);
/** The half that leaves a permanent account behind runs only when asked. */
const signupEnabled = enabled && env.RUN_LIVE_SIGNUP_SMOKE === "1";

describe.runIf(enabled)("auth signup + token refresh never return 5xx", () => {
  const headers = {
    "Content-Type": "application/json",
    apikey: ANON_KEY!,
    Authorization: `Bearer ${ANON_KEY}`,
  };

  it.runIf(signupEnabled)("POST /auth/v1/signup does not fail with a server error", async () => {
    const email = `signup-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@outreign-tests.com`;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password: `Smoke!${Math.random().toString(36).slice(2, 10)}A1` }),
    });
    const body = await res.text();
    expect(res.status, `signup returned ${res.status}: ${body}`).toBeLessThan(500);
  }, 30_000);

  it("POST /auth/v1/token (refresh_token grant) rejects cleanly instead of 500", async () => {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token: "definitely-not-a-valid-refresh-token" }),
    });
    const body = await res.text();
    expect(res.status, `token refresh returned ${res.status}: ${body}`).toBeLessThan(500);
  }, 30_000);
});
