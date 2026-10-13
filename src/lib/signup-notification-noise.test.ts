import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isReservedTestRecipient } from "../../supabase/functions/_shared/test-recipients";

/**
 * "🎉 New User Signup", every time anyone ran the test suite.
 *
 * src/test/auth-signup-refresh.test.ts posts a real signup to the live
 * backend to prove the provisioning trigger does not 500. The publishable key
 * and project URL live in a committed .env — correct for a Vite app — so it
 * ran for CI on every commit, for Lovable, and for anyone who cloned the repo
 * and typed `vitest run`. Each run left a permanent account behind and put an
 * admin notification in a real inbox.
 *
 * isReservedTestRecipient existed and was already applied to every send. It
 * guards the RECIPIENT, so the welcome, founder-note and onboarding emails
 * addressed to @outreign-tests.com were correctly suppressed — and the admin
 * notification, addressed to a real inbox ABOUT the test address, was not.
 */

const NOTIFIER = readFileSync("supabase/functions/notify-new-signup/index.ts", "utf8");
const SMOKE = readFileSync("src/test/auth-signup-refresh.test.ts", "utf8");
const bare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("a synthetic signup produces nothing", () => {
  const code = bare(NOTIFIER);

  it("drops on the address that signed up, not the one being notified", () => {
    expect(code).toContain("if (isReservedTestRecipient(rawEmail))");
    expect(code).toContain("skipped: 'test_domain'");
  });

  it("uses the shared list rather than its own", () => {
    expect(code).toContain('from "../_shared/test-recipients.ts"');
    expect(code).not.toMatch(/outreign-tests\.com/);
  });

  it("drops before the analytics event, not only before the email", () => {
    // A smoke signup counted in PostHog is a number in the funnel that never
    // belonged to a person.
    const guard = code.indexOf("isReservedTestRecipient(rawEmail)");
    const posthog = code.indexOf("captureServerEvent(");
    const firstSend = code.indexOf("sendAppEmail(");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(posthog);
    expect(guard).toBeLessThan(firstSend);
  });

  it("still notifies for a real signup", () => {
    expect(isReservedTestRecipient("dana@kogenie.com")).toBe(false);
    expect(isReservedTestRecipient("brandon@bdotindustries.com")).toBe(false);
  });

  it("covers the addresses the smoke test actually mints", () => {
    // Pinned to the generator, not to a sample: the test builds the address
    // from a timestamp and a random suffix on this domain.
    const domain = SMOKE.match(/@([a-z0-9.-]+)`/i)?.[1];
    expect(domain).toBeTruthy();
    expect(isReservedTestRecipient(`signup-smoke-${Date.now()}-ox8lup@${domain}`)).toBe(true);
  });
});

describe("the suite stops creating permanent accounts", () => {
  it("the signup half runs only when asked for", () => {
    expect(SMOKE).toContain('env.RUN_LIVE_SIGNUP_SMOKE === "1"');
    expect(SMOKE).toContain('it.runIf(signupEnabled)("POST /auth/v1/signup');
  });

  it("the half that creates nothing still runs on every commit", () => {
    // An invalid refresh token leaves no row, and the 500 on /auth/v1/token is
    // worth guarding continuously.
    const refresh = SMOKE.slice(SMOKE.indexOf("POST /auth/v1/token"));
    expect(SMOKE).toContain('it("POST /auth/v1/token');
    expect(refresh).not.toContain("signupEnabled");
  });

  it("is the only test that writes to the live backend", () => {
    // A second one would reintroduce the problem somewhere nobody is looking.
    // The app's own AuthForm signs users up too, which is the point of it.
    expect(execLive()).toEqual(["src/test/auth-signup-refresh.test.ts"]);
  });
});

function execLive(): string[] {
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  try {
    return execFileSync(
      "git",
      ["grep", "-l", "--untracked", "-E", "auth/v1/signup|\\.signUp\\(", "--", "src"],
      { cwd: process.cwd(), encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .filter((f) => f.endsWith(".test.ts") && f !== "src/lib/signup-notification-noise.test.ts");
  } catch {
    return [];
  }
}
