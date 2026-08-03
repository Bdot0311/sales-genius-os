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

describe.runIf(enabled)("auth signup + token refresh never return 5xx", () => {
  const headers = {
    "Content-Type": "application/json",
    apikey: ANON_KEY!,
    Authorization: `Bearer ${ANON_KEY}`,
  };

  it("POST /auth/v1/signup does not fail with a server error", async () => {
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
