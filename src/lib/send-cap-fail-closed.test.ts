import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

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

/**
 * The daily cap was being enforced against a number that could never rise.
 *
 * `increment_daily_emails_sent` carried `AND status = 'active'`. On a
 * past_due, paused or cancelled row the UPDATE matched zero rows and
 * *succeeded* — no error, so the caller's error-only fallback never ran and
 * `daily_emails_sent` stayed at zero for good. The Free fallback above would
 * then have let a lapsed account spend its whole monthly allowance in a
 * single day, which is the send spike a daily cap exists to prevent.
 *
 * Both caps are now counted rather than remembered, in both senders.
 */
const MIGRATIONS = "supabase/migrations";

/**
 * The migration that defines `name` last, which is the one that runs.
 *
 * Reading the file that first added a function pins a definition a later
 * migration may have replaced — the assertion then passes while production
 * runs something else. Anchored on the CREATE rather than on
 * `FUNCTION public.<name>`, which also appears in the REVOKE that follows and
 * slices from there into the next function's body.
 */
function liveDefinition(name: string): { file: string; sql: string; whole: string } {
  const create = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(`${MIGRATIONS}/${f}`, "utf8").includes(create));
  expect(files.length, `nothing defines ${name}`).toBeGreaterThan(0);
  const file = files[files.length - 1];
  const whole = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
  const from = whole.lastIndexOf(create);
  const end = whole.indexOf("\n$$;", from);
  expect(end, `${name} in ${file} has no closing $$;`).toBeGreaterThan(from);
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
  return { file, sql: strip(whole.slice(from, end)), whole: strip(whole) };
}

describe("today's sends are counted, not remembered", () => {
  it("the counter no longer skips lapsed accounts", () => {
    const { sql } = liveDefinition("increment_daily_emails_sent");
    expect(sql).toContain("UPDATE public.subscriptions");
    // The filter is the whole defect: zero rows updated, and no error raised.
    expect(sql).not.toMatch(/status\s*=\s*'active'/);
  });

  it("counts a day the same way the month is counted", () => {
    /*
     * Compared against the live monthly function rather than restated, so the
     * two caps cannot drift apart on what counts as a send.
     */
    const daily = liveDefinition("get_daily_email_count").sql;
    const monthly = liveDefinition("get_monthly_email_count").sql;
    const statuses = (sql: string) => sql.match(/status IN \(([^)]*)\)/)?.[1];
    expect(statuses(daily)).toBeTruthy();
    expect(statuses(daily)).toBe(statuses(monthly));
    expect(daily).toContain("date_trunc('day', now())");
    expect(monthly).toContain("date_trunc('month', now())");
  });

  it("refuses rather than returning zero to a caller it cannot place", () => {
    /*
     * Both senders treat a non-number as unreadable and refuse the send, so a
     * quiet zero would read as "nothing sent today" and wave the send through.
     *
     * IS DISTINCT FROM, not `<>`: against a null auth.uid() the comparison is
     * null, the IF never fires and the check passes. That is how an early
     * draft of this read any account's usage, caught by a test with a null uid.
     */
    for (const name of ["get_daily_email_count", "get_monthly_email_count"]) {
      const { sql } = liveDefinition(name);
      expect(sql, name).toMatch(/auth\.role\(\) IS DISTINCT FROM 'service_role'/);
      expect(sql, name).toMatch(/auth\.uid\(\) IS DISTINCT FROM p_user_id/);
      expect(sql, name).toMatch(/RAISE EXCEPTION/);
    }
  });

  it("stays unreachable from the browser", () => {
    const { whole } = liveDefinition("get_daily_email_count");
    expect(whole).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_daily_email_count\(UUID\) FROM PUBLIC, anon;/,
    );
  });

  it("send-email caps on the count and fails closed", () => {
    expect(code).toMatch(/\.rpc\('get_daily_email_count', \{ p_user_id: user\.id \}\)/);
    const at = code.indexOf("if (dailyErr || typeof dailyCount !== 'number')");
    expect(at, "an unreadable daily count must not read as zero").toBeGreaterThan(-1);
    const branch = code.slice(at, at + 400);
    expect(branch).toContain("return new Response");
    expect(branch).toContain("daily_count_unavailable");
    // And the cap must compare the count, not the counter column.
    expect(code).toMatch(/const dailySent = dailyCount;/);
    expect(code).not.toMatch(/dailySent = subscription\?\.daily_emails_sent/);
  });
});

/**
 * The cron sender had the identical hole, and it is the one that sends in bulk.
 *
 * `.eq('status', 'active').single()` then `if (sub) { userLimits[uid] = ... }`
 * left no entry for a lapsed account, and every cap below was written
 * `if (ul && ...)` — so a missing entry meant no daily cap and no monthly cap
 * on exactly the accounts that should have been held tightest.
 */
const CRON = readFileSync("supabase/functions/process-scheduled-emails/index.ts", "utf8");
const cron = CRON.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the scheduled sender caps lapsed accounts too", () => {
  it("does not ask only for the active row", () => {
    const read = cron.slice(cron.indexOf("from('subscriptions')"));
    const stmt = read.slice(0, read.indexOf(";"));
    expect(stmt).not.toMatch(/\.eq\('status', 'active'\)/);
    expect(stmt).toContain("maybeSingle()");
    expect(stmt).toMatch(/select\('plan, status,/);
  });

  it("resolves an allowance whether or not a row came back", () => {
    // The defect in one line: the entry was built only when a row existed.
    expect(cron).not.toMatch(/if \(sub\) \{/);
    expect(cron).toMatch(/const planActive = sub\?\.status === 'active'/);
    expect(cron).toMatch(/dailyLimit: planActive \? \(sub\?\.daily_email_limit \|\| 10\) : 10/);
    expect(cron).toMatch(/const plan = planActive \? String\(sub\?\.plan \?\? 'free'\) : 'free'/);
    expect(cron).toMatch(/MONTHLY_EMAIL_LIMITS\[plan\]/);
  });

  it("enforces both caps unconditionally once resolved", () => {
    /*
     * `if (ul && ...)` is what let an unresolved sender through. The guard is
     * now a missing entry stopping the send outright.
     */
    expect(cron).not.toMatch(/if \(ul &&/);
    expect(cron).toMatch(/if \(ul\.dailySent >= ul\.dailyLimit\)/);
    expect(cron).toMatch(/if \(ul\.monthlyLimit !== -1 && ul\.monthlySent >= ul\.monthlyLimit\)/);
  });

  it("defers rather than sending on an unreadable allowance", () => {
    const at = cron.indexOf("if (!ul)");
    expect(at).toBeGreaterThan(-1);
    const branch = cron.slice(at, at + 400);
    expect(branch).toContain("defer(email,");
    expect(branch).toContain("continue;");
  });

  it("uses the same two counts as send-email", () => {
    expect(cron).toMatch(/\.rpc\('get_daily_email_count', \{ p_user_id: uid \}\)/);
    expect(cron).toMatch(/\.rpc\('get_monthly_email_count', \{ p_user_id: uid \}\)/);
    // The hand-rolled monthly count counted 'bounced' as a send; the shared
    // function does not. One sender charging for a bounce and the other not
    // is the same account getting two different allowances.
    expect(cron).not.toMatch(/'replied', 'bounced'/);
  });

  it("increments the display counter atomically", () => {
    // `read + 1` lost updates whenever two runs overlapped on one account.
    expect(cron).toMatch(/\.rpc\('increment_daily_emails_sent', \{/);
    expect(cron).toMatch(/_user_id: email\.user_id,/);
    expect(cron).not.toMatch(/daily_emails_sent: \(ul\?\.dailySent \|\| 0\) \+ 1/);
    // The batch's own view still advances, so one run cannot outrun its cap.
    expect(cron).toMatch(/ul\.dailySent \+= 1;/);
  });
});
