import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Nine platform emails carried an idempotency key with a clock in it.
 *
 *     idempotencyKey: `sub-confirm-${email}-${Date.now()}`
 *
 * A key exists so the same send, attempted twice, arrives once. A key holding
 * the current millisecond is different on every attempt and so can never match
 * a previous one: the appearance of at-most-once delivery with none of it.
 *
 * It did not need anything to go wrong. The subscription confirmation is
 * invoked from the Confirmation page's effect, guarded by a React ref that
 * lives only as long as the mounted component — reload after the Stripe
 * redirect, or open the link in a second tab, and the customer gets another
 * "Subscription Confirmed!" email. The error and critical alerts were worse
 * quietly: a condition that kept firing mailed support every time it fired.
 */

const FN_ROOT = "supabase/functions";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

/** Comments stripped: a comment quoting the old key must not trip the scan. */
function body(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const FILES = walk(FN_ROOT);

describe("an idempotency key never contains a clock", () => {
  it("found call sites to check", () => {
    // If the scan matched nothing, every assertion below would pass vacuously.
    const withKeys = FILES.filter((f) => body(f).includes("idempotencyKey:"));
    expect(withKeys.length).toBeGreaterThan(10);
  });

  it("no key varies by the moment it is built", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const line of body(file).split("\n")) {
        const at = line.indexOf("idempotencyKey:");
        if (at < 0) continue;
        const value = line.slice(at + "idempotencyKey:".length);
        /*
         * Date.now(), performance.now() and Math.random() all make the key
         * unique per attempt. A dated or hour-bucketed key is fine and is the
         * fix — `toISOString().slice(0, 13)` is deliberately allowed.
         */
        if (/Date\.now\(\)|performance\.now\(\)|Math\.random\(\)|randomUUID\(\)/.test(value)) {
          offenders.push(`${file}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, "a key that cannot repeat cannot deduplicate").toEqual([]);
  });

  it("omits the key where a repeat must reach the person", () => {
    /*
     * The two password-reset paths. A key here would swallow the resend
     * someone explicitly asked for, so they pass none and the transport falls
     * back to a fresh id of its own.
     */
    for (const file of ["reset-password", "admin-send-reset-email"]) {
      const src = body(`${FN_ROOT}/${file}/index.ts`);
      expect(src, file).toContain("sendManagedEmail");
      expect(src, file).not.toContain("idempotencyKey:");
    }
  });
});

describe("the keys that must be stable are", () => {
  const key = (file: string) => {
    const src = body(`${FN_ROOT}/${file}/index.ts`);
    const at = src.indexOf("idempotencyKey:");
    expect(at, `${file} should pass a key`).toBeGreaterThan(-1);
    return src.slice(at, src.indexOf("\n", at));
  };

  it("one trial warning per stage per recipient", () => {
    // The label already names the stage, so the key needs nothing else.
    expect(key("send-trial-warnings")).toContain("`${label}-${to}`");
  });

  it("one subscription confirmation per plan per day", () => {
    const k = key("send-subscription-confirmation");
    expect(k).toContain("sub-confirm-");
    expect(k).toContain("${planName}");
    expect(k).toContain("toISOString().slice(0, 10)");
  });

  it("one set of account credentials per created account", () => {
    expect(key("create-account-with-subscription")).toContain("`account-creds-${userData.user?.id}`");
  });

  it("alerts collapse to one an hour", () => {
    // Hour buckets, matching system-health-alert, which already did this.
    for (const file of ["send-system-alert", "send-security-alert", "detect-suspicious-activity"]) {
      expect(key(file), file).toContain("alertHour()");
    }
  });

  it("an alert key names the incident, not just its shape", () => {
    /*
     * An hourly bucket of kind + recipient collapses two *different* accounts
     * tripping the same condition in one hour into a single email: support
     * hears about the first and never about the second. The bucket is for
     * repeats of one incident, so the key has to carry whatever identifies
     * which incident it is.
     */
    expect(key("send-system-alert")).toContain("alertAbout");
    expect(body(`${FN_ROOT}/send-system-alert/index.ts`))
      .toMatch(/const alertAbout = typeof d\.user_id === "string" \? d\.user_id : \(customerEmail \?\? "platform"\)/);

    expect(key("send-security-alert")).toContain('user_id ?? ip_address ?? "platform"');

    // The per-user alert goes to the subject, so the recipient identifies it;
    // the admin digest covers whoever tripped a rule this run, and two runs an
    // hour apart can cover different people entirely.
    const SUS = body(`${FN_ROOT}/detect-suspicious-activity/index.ts`);
    expect(key("detect-suspicious-activity")).toContain("about");
    expect(SUS).toMatch(/criticalAlerts\.map\(\(a: any\) => `\$\{a\.type\}:\$\{a\.target\}`\)/);
    expect(SUS).toContain("'suspicious-activity-admin', about)");
  });

  it("no key is built by truncation", () => {
    /*
     * Every one of these was assembled by template and cut with
     * `.slice(0, 200)`, which fails in two directions at once. A long part — a
     * 150-character customer email in a billing alert — eats the end of the
     * string, and the end is where the hour lives: the key stops varying by
     * hour, so the first alert of its kind is the last one ever sent. And two
     * identities sharing a 200-character prefix become one key, so the second
     * incident reaches nobody. In an alert channel both are silence.
     */
    for (const file of [
      "send-system-alert",
      "send-security-alert",
      "detect-suspicious-activity",
      "deliverability-alerts-scan",
    ]) {
      const k = key(file);
      expect(k, file).toContain("await dedupeKey(");
      expect(k, file).not.toContain(".slice(0, 200)");
    }
  });

  it("the key builder hashes the whole identity", () => {
    const TRANSPORT = body(`${FN_ROOT}/_shared/managed-email.ts`);
    const at = TRANSPORT.indexOf("export async function dedupeKey(");
    expect(at, "one builder, so no caller has to get this right again").toBeGreaterThan(-1);
    const fn = TRANSPORT.slice(at, TRANSPORT.indexOf("\nexport ", at + 1));
    expect(fn).toContain('crypto.subtle.digest("SHA-256"');
    // NUL between the parts, which cannot appear in any of them, so ("a","bc")
    // and ("ab","c") stay two identities rather than one.
    expect(fn).toMatch(/\.join\("\\u0000"\)/);
    // Bounded by construction: only the label is cut, never the identity.
    expect(fn).toContain("label.slice(0, 40)");
    expect(fn).not.toMatch(/material\.slice|parts\.slice/);
  });

  it("a deduped alert is neither an error nor a delivery failure", () => {
    const src = body(`${FN_ROOT}/send-system-alert/index.ts`);
    // Out of `errors`...
    expect(src).toMatch(/else if \(result\.reason === 'already_sent'\) deduped\+\+;/);
    /*
     * ...and out of the failure check. With every recipient already covered,
     * `emailed` stays zero, and the old check then logged an outage and
     * returned `send_failed` — inventing a delivery failure out of the dedupe
     * working, in the one system whose job is to report outages honestly.
     */
    expect(src).toMatch(/if \(emailed === 0 && deduped === 0\) \{/);
    expect(src).toMatch(/emailed: emailed > 0/);
  });
});

describe("the key is enforced where it can be verified", () => {
  const TRANSPORT = body(`${FN_ROOT}/_shared/managed-email.ts`);
  const WRAPPER = body(`${FN_ROOT}/_shared/transactional-email-templates/send-app-email.ts`);

  it("looks for its own key before sending", () => {
    const at = TRANSPORT.indexOf("export async function alreadySentUnderKey(");
    expect(at, "the key has to be read for it to mean anything").toBeGreaterThan(-1);
    const fn = TRANSPORT.slice(at, TRANSPORT.indexOf("\nexport ", at + 1));
    expect(fn).toContain("from('email_send_log')");
    expect(fn).toContain(".eq('dedupe_key', key)");
    expect(fn).toMatch(/\.in\('status', \['sent', 'suppressed'\]\)/);
    // No key means the caller wanted a fresh send; the check must not block it.
    expect(fn).toMatch(/if \(!key\) return false/);
  });

  it("sends rather than drops when the check itself fails", () => {
    /*
     * The alternative is losing a welcome or confirmation email because one
     * SELECT failed. The provider key is the fallback layer for that case.
     */
    const at = TRANSPORT.indexOf("export async function alreadySentUnderKey(");
    const fn = TRANSPORT.slice(at, TRANSPORT.indexOf("\nexport ", at + 1));
    const branch = fn.slice(fn.indexOf("if (priorErr) {"), fn.indexOf("if (prior) {"));
    expect(branch).toContain("return false");
    expect(branch).not.toContain("throw");
  });

  it("both transports use the one check", () => {
    /*
     * Two senders exist — the plain one and the template wrapper — and a
     * feature picks either. A key that means at-most-once through one and
     * nothing through the other is worse than no rule at all.
     */
    for (const [name, src, key] of [
      ["managed-email", TRANSPORT, "input.idempotencyKey, input.label"],
      ["send-app-email", WRAPPER, "options.idempotencyKey, templateName"],
    ] as const) {
      expect(src, name).toContain(`alreadySentUnderKey(supabase, ${key})`);
      expect(src, name).toContain("reason: 'already_sent'");
    }
  });

  it("checks before the send, not after it", () => {
    expect(TRANSPORT.indexOf("alreadySentUnderKey(supabase, input.idempotencyKey"))
      .toBeLessThan(TRANSPORT.indexOf("await sendLovableEmail(payload, options)"));
    expect(WRAPPER.indexOf("alreadySentUnderKey(supabase, options.idempotencyKey"))
      .toBeLessThan(WRAPPER.indexOf("result = await send()"));
  });

  it("records the key on the row each send writes", () => {
    // Without this the next send has nothing to find.
    expect([...TRANSPORT.matchAll(/dedupe_key: input\.idempotencyKey \?\? null,/g)].length).toBe(2);
    expect([...WRAPPER.matchAll(/dedupe_key: options\.idempotencyKey \?\? null,/g)].length).toBe(2);
  });

  it("a failed send records no key, so it stays retryable", () => {
    for (const [name, src] of [["managed-email", TRANSPORT], ["send-app-email", WRAPPER]] as const) {
      const at = src.indexOf("status: 'failed',");
      expect(at, name).toBeGreaterThan(-1);
      expect(src.slice(at, at + 200), name).not.toContain("dedupe_key");
    }
  });

  it("still passes the key to the provider", () => {
    // The layer that catches two sends racing before either has logged a row.
    expect(TRANSPORT).toContain("idempotency_key: input.idempotencyKey || messageId,");
    expect(WRAPPER).toContain("idempotencyKey: options.idempotencyKey,");
  });

  it("treats a lost race as the dedupe working", () => {
    const at = TRANSPORT.indexOf("if (error.code === '23505') return");
    expect(at, "a unique violation on the key is the normal outcome of a race").toBeGreaterThan(-1);
  });
});

describe("a deduped send is never reported as a failure", () => {
  /*
   * Every consumer that branches on the result. Counted as an error, the
   * second run of a job reports the first run's success as a fault: a red row
   * in the admin panel, or an alert about an alert that was delivered.
   */
  it("the re-engagement log records a skip, not a failure", () => {
    const src = body(`${FN_ROOT}/send-re-engagement-emails/index.ts`);
    expect(src).toMatch(/const alreadySent = !sendRes\.sent && sendRes\.reason === 'already_sent'/);
    expect(src).toMatch(/sendRes\.sent \|\| alreadySent \? null :/);
    expect(src).toMatch(/status: wasSuppressed \|\| alreadySent \? 'skipped' :/);
    // 'skipped' is one of the three values the status CHECK allows.
    expect(src).not.toMatch(/status: .*alreadySent \? 'already_sent'/);
  });

  it("the interview jobs count it as skipped", () => {
    for (const file of ["send-customer-interview-emails", "send-churn-interview-emails"]) {
      const src = body(`${FN_ROOT}/${file}/index.ts`);
      const at = src.indexOf("if (res.sent) {");
      expect(at, file).toBeGreaterThan(-1);
      const branch = src.slice(at, src.indexOf("errors.push", at));
      expect(branch, file).toContain("res.reason === 'already_sent'");
      expect(branch, file).toContain("skipped++;");
    }
  });

  it("the signup emails log it rather than erroring", () => {
    const src = body(`${FN_ROOT}/notify-new-signup/index.ts`);
    const guards = [...src.matchAll(/\.reason === 'already_sent' \? console\.log : console\.error/g)];
    // One per email the signup sends: notification, welcome, founder note, offer.
    expect(guards.length).toBe(4);
  });
});

describe("the database is what makes it hold", () => {
  const MIGRATION = readFileSync(
    "supabase/migrations/20261017020000_email_send_dedupe_key.sql",
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

  it("adds the column the check reads", () => {
    expect(MIGRATION).toMatch(/ALTER TABLE public\.email_send_log\s+ADD COLUMN IF NOT EXISTS dedupe_key text;/);
  });

  it("allows one row per key and any number without one", () => {
    /*
     * Verified on Postgres 16: a second insert with the same key is rejected,
     * and two rows with a null key are both accepted — which has to stay true,
     * because every unkeyed send writes one.
     */
    expect(MIGRATION).toContain("CREATE UNIQUE INDEX IF NOT EXISTS idx_email_send_log_dedupe_key");
    expect(MIGRATION).toMatch(/ON public\.email_send_log \(dedupe_key\)\s+WHERE dedupe_key IS NOT NULL;/);
  });
});
