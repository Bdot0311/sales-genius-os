import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The accounts that should have sent least were sending with no cap at all.
 *
 * send-email read the subscription with `.eq('status', 'active').single()`
 * and kept `subError` without ever reading it. `.single()` errors when there
 * are no rows, so an account that is `past_due`, `paused` or `cancelled` —
 * all three of which the billing path writes — produced a null subscription.
 * Every plan-level check hung off `if (subscription)`, and the Gmail call is
 * three hundred lines below it, outside.
 *
 * The only other cap is per-mailbox, runs only when a sending account is
 * resolved, and is explicitly non-fatal on error. So for a lapsed account
 * there was no daily cap and no monthly cap.
 *
 * The same hole swallowed a transient read failure — which is the exact shape
 * the monthly count in this same function already guards against, with a
 * comment saying a cap that reads zero on error is no cap at all. That
 * reasoning was one level too deep.
 */

const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");
/** Body only: a comment quoting code must not satisfy an assertion about it. */
const code = SEND.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("a send allowance that cannot be read stops the send", () => {
  it("reads the error it asks for", () => {
    const uses = [...code.matchAll(/subError/g)].length;
    expect(uses, "subError should be read, not just captured").toBeGreaterThan(1);
    expect(code).toMatch(/if \(subError\)/);
  });

  it("refuses rather than sending uncapped", () => {
    const at = code.indexOf("if (subError)");
    expect(at).toBeGreaterThan(-1);
    const branch = code.slice(at, at + 500);
    expect(branch).toContain("return new Response");
    expect(branch).toContain("allowance_unavailable");
  });

  it("does not ask only for the active row", () => {
    /*
     * The filter is what turned "this account is lapsed" into "this account
     * has no limits": no rows, `.single()` errors, the block is skipped.
     */
    const read = code.slice(code.indexOf("from('subscriptions')"));
    const stmt = read.slice(0, read.indexOf(";"));
    expect(stmt).not.toMatch(/\.eq\('status', 'active'\)/);
    expect(stmt).toContain("maybeSingle()");
    // And it must select the status, or it cannot tell lapsed from active.
    expect(stmt).toMatch(/select\('plan, status,/);
  });
});

describe("no active plan means Free, not unlimited", () => {
  it("decides from the status rather than from the row existing", () => {
    expect(code).toMatch(/const planActive = subscription\?\.status === 'active'/);
  });

  it("falls back to the Free allowance", () => {
    // 10 a day and 100 a month: the most restrictive reading of "no current
    // plan", and the right one for an account whose card failed.
    expect(code).toMatch(/effectiveDailyLimit = planActive \? \(subscription\?\.daily_email_limit \|\| 10\) : 10/);
    expect(code).toMatch(/effectivePlan = planActive \? String\(subscription\?\.plan \?\? 'free'\) : 'free'/);
    expect(code).toMatch(/free: 100,/);
  });

  it("checks the caps whether or not a row came back", () => {
    // The whole defect in one line: `if (subscription) {` made every check
    // below conditional on the read having returned something.
    expect(code).not.toMatch(/if \(subscription\) \{/);
  });

  it("uses the resolved limits, not the row's, when it enforces", () => {
    expect(code).toMatch(/const dailyLimit = effectiveDailyLimit;/);
    expect(code).toMatch(/MONTHLY_EMAIL_LIMITS\[effectivePlan\]/);
    // A lapsed account must not be told it hit the cap "on your pro plan".
    expect(code).not.toMatch(/MONTHLY_EMAIL_LIMITS\[subscription\.plan/);
  });
});

describe("the statuses this guards against are real", () => {
  it("the billing path writes more than active", () => {
    /*
     * Asserted against the billing code rather than assumed: if those
     * statuses ever stopped being written, this guard would be arguing with
     * a situation that no longer happens — and if new ones appear, the
     * fallback covers them by default rather than by name.
     */
    const BILLING = readFileSync("supabase/functions/_shared/process-stripe-event.ts", "utf8");
    const written = new Set(
      [...BILLING.matchAll(/status: '([a-z_]+)'/g)].map((m) => m[1]),
    );
    expect(written.has("active")).toBe(true);
    expect([...written].filter((s) => s !== "active").length).toBeGreaterThan(0);
  });
});
