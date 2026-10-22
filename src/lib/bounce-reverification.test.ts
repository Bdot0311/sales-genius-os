import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * A bounce is refunded, and the refund is spent on finding out whether the
 * address is actually bad.
 *
 * The refund shipped first; this is the half that makes it worth something.
 * The three bounce types mean different things and only some are worth a paid
 * check, and the whole thing turns on not trusting a classification further
 * than it goes.
 */

const SRC = readFileSync("supabase/functions/sync-bounces/index.ts", "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const VERIFY = readFileSync("supabase/functions/_shared/email-verify.ts", "utf8");

describe("a bounce is not trusted further than it goes", () => {
  it("only a 5xx condemns an address without checking", () => {
    /*
     * classifyBounce tests its hard regex BEFORE its 4xx test, and that regex
     * contains "mailbox unavailable" — the wording of a temporary 450. So a
     * merely-full mailbox arrives classified hard, and marking the lead
     * invalid on that discards a real prospect for good.
     */
    expect(code).toMatch(/const permanentlyBad = type === "hard" && \/\^5\/\.test\(code \?\? ""\)/);
    // The classifier really does route a temporary failure to "hard".
    const classifier = SRC.slice(SRC.indexOf("export function classifyBounce"));
    const hardLine = classifier.slice(classifier.indexOf("hard"), classifier.indexOf('return { type: "hard", code };'));
    expect(hardLine, "if this stops matching, the 5xx guard is unnecessary")
      .toContain("mailbox unavailable");
  });

  it("an unprovable verdict is not written over a real one", () => {
    const at = code.indexOf('if (verdict.status === "unknown") return false;');
    expect(at, "'unknown' means the check proved nothing").toBeGreaterThan(-1);
  });

  it("the verdict goes to the address that bounced, not just the lead", () => {
    /*
     * A bounce can arrive days after the send. If the address was corrected
     * in the meantime, writing this verdict condemns the replacement for its
     * predecessor's failure.
     */
    const at = code.indexOf('.from("leads")');
    expect(at).toBeGreaterThan(-1);
    const stmt = code.slice(at, code.indexOf("if (leadErr)", at));
    expect(stmt).toContain('.eq("id", leadId)');
    expect(stmt).toContain('.eq("user_id", user.id)');
    expect(stmt).toMatch(/\.ilike\("contact_email", email\)/);
  });

  it("a failed write is not counted as a success", () => {
    const at = code.indexOf("if (leadErr)");
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 200)).toContain("return false");
    // Counted from what the database confirmed, not from having attempted it.
    expect(code).toMatch(/if \(\(count \?\? 0\) > 0\) reverified\+\+/);
  });
});

describe("the cached verdict is not mistaken for a new one", () => {
  it("the cache is cleared before a bounce re-check", () => {
    /*
     * verifyEmail caches for thirty days. The cached answer was formed before
     * the bounce — reusing it stamps today's date on a check that never
     * happened, and on the one verdict the bounce has already contradicted.
     */
    expect(code).toContain("await invalidateEmailVerification(");
    const inv = code.indexOf("invalidateEmailVerification");
    const ver = code.indexOf("await verifyEmail(", inv);
    expect(ver, "clearing after the check would be pointless").toBeGreaterThan(inv);
  });

  it("the invalidator targets the key verifyEmail actually reads", () => {
    // Asserted against the reader rather than assumed: a key that drifted
    // would leave the cache untouched and the bug silently back.
    expect(VERIFY).toContain("const cacheKey = `email_verify:${email}`");
    const at = VERIFY.indexOf("export async function invalidateEmailVerification");
    expect(at).toBeGreaterThan(-1);
    const fn = VERIFY.slice(at, VERIFY.indexOf("\nexport ", at + 1));
    expect(fn).toContain("`email_verify:${email}`");
    // Same normalisation, or the two compute different keys for one address.
    expect(fn).toContain(".trim().toLowerCase()");
  });
});

describe("work the budget skips is deferred, not dropped", () => {
  it("every bounce is recorded as owing a re-check", () => {
    /*
     * sync-bounces marks the send 'bounced' as it goes and the next run only
     * looks at sends that are not — so anything skipped was never revisited.
     */
    expect(code).toMatch(/reverified_at: null/);
    expect(code).toMatch(/\.update\(\{ reverified_at: new Date\(\)\.toISOString\(\) \}\)/);
  });

  it("a later run picks up what an earlier one could not reach", () => {
    const at = code.indexOf('.is("reverified_at", null)');
    expect(at, "nothing would ever revisit a skipped bounce").toBeGreaterThan(-1);
    const sweep = code.slice(code.indexOf("const { data: backlog }"), at + 300);
    expect(sweep).toContain('.from("bounce_events")');
    expect(sweep).toMatch(/\.order\("detected_at", \{ ascending: true \}\)/);
  });

  it("both paths go through one implementation", () => {
    /*
     * The repeated failure this week has been a decision implemented
     * correctly in one place and not in the other, so the inline path and the
     * sweep share a single function rather than two copies of the rules.
     */
    // One definition of the rules...
    expect([...code.matchAll(/const applyBounceToLead = async \(/g)].length).toBe(1);
    // ...reached through one wrapper that stamps the attempt...
    expect([...code.matchAll(/const attemptBounce = async \(/g)].length).toBe(1);
    expect([...code.matchAll(/await applyBounceToLead\(/g)].length).toBe(1);
    // ...which both the inline drain and the backlog sweep go through.
    expect([...code.matchAll(/await attemptBounce\(/g)].length).toBe(2);
    // No second copy of the rules that could drift from the first.
    expect([...code.matchAll(/permanentlyBad/g)].length).toBe(2);
  });

  it("the bounce is recorded before the send is marked", () => {
    /*
     * Marking first loses the work whenever the recording fails: the send is
     * already 'bounced', the query at the top only looks at sends that are
     * not, and the re-check is gone with nothing left to say it was owed.
     */
    const insertAt = code.indexOf('.from("bounce_events")');
    const markAt = code.indexOf('.update({ status: "bounced"');
    expect(insertAt, "the bounce_events write should come first").toBeGreaterThan(-1);
    expect(markAt).toBeGreaterThan(-1);
    expect(insertAt).toBeLessThan(markAt);
    // A failed recording leaves the send alone so the next run retries.
    const branch = code.slice(code.indexOf("if (insErr || !inserted?.id)"), markAt);
    expect(branch).toContain("continue;");
  });

  it("a second bounce for one address does not buy the answer twice", () => {
    /*
     * Two layers, and the second is not redundant.
     *
     * The obtained-at comparison already collapses repeats, because the first
     * check of the run rewrites the cache entry. It only fails to do so if
     * that write itself failed — cacheSet swallows its own errors — and then
     * every later bounce for the address would clear and pay again. This set
     * holds the line without depending on the cache having worked.
     */
    expect(code).toContain("const checkedThisRun = new Set<string>();");
    const at = code.indexOf("if (needsFreshCheck && !checkedThisRun.has(email))");
    expect(at).toBeGreaterThan(-1);
    const block = code.slice(at, code.indexOf("checkedThisRun.add(email)", at));
    expect(block).toContain("invalidateEmailVerification");
    // Recorded whether the answer was bought or read, or the set never fills.
    const add = code.indexOf("checkedThisRun.add(email)");
    expect(code.slice(add - 200, add)).toContain("await verifyEmail(");
  });

  it("the stored verdict is only cleared when it predates the bounce", () => {
    /*
     * The ordinary case is a verdict formed before the bounce, and that entry
     * has to go or verifyEmail hands back the answer the bounce has already
     * contradicted. The opposite case is an answer obtained AFTER the bounce
     * — by another bounce for the same address, or by an earlier attempt on
     * this row that answered it and then failed to record that it had. There,
     * clearing it would throw away the very thing this row exists to get.
     */
    expect(code).toContain("const checkedAt = await emailVerificationCheckedAt(cacheClient, email);");
    expect(code).toContain(
      "const needsFreshCheck = !checkedAt || checkedAt.getTime() <= Date.parse(detectedAt);",
    );
    // The invalidation is gated on it, which is the whole point.
    expect(code).toContain("if (needsFreshCheck && !checkedThisRun.has(email)) {");
    const gate = code.indexOf("if (needsFreshCheck && !checkedThisRun.has(email))");
    const inv = code.indexOf("invalidateEmailVerification(cacheClient, email)", gate);
    expect(inv).toBeGreaterThan(gate);
  });

  it("an answer that is already paid for costs nothing to reuse", () => {
    /*
     * No credit and no budget slot. The budget is a fixed number of addresses
     * per run, so charging for a cache read would come out of some other
     * lead's turn, and the ceiling would start cutting runs short over work
     * that never cost anything.
     */
    expect(code).toContain(
      "if (needsFreshCheck && (verifications >= MAX_VERIFICATIONS || outOfTime())) {",
    );
    expect(code).toContain("if (needsFreshCheck) verifications++;");
  });

  it("a reused answer still takes the row out of the queue", () => {
    /*
     * The first version of this returned early on a reused answer, which left
     * `reverified_at` unset: the row kept its slot in every later sweep and
     * kept being counted as swept. The reuse path has to reach the same
     * checked completion write as every other path, so the only `return
     * true` in the function is the one after that write.
     */
    const at = code.indexOf("const applyBounceToLead = async");
    const fn = code.slice(at, code.indexOf("const attemptBounce = async", at));
    expect([...fn.matchAll(/return true;/g)].length, "one way out, after the write").toBe(1);
    const done = fn.indexOf('.update({ reverified_at: new Date().toISOString() })');
    expect(done).toBeGreaterThan(-1);
    expect(fn.indexOf("return true;")).toBeGreaterThan(done);
  });

  it("the obtained-at date is the cache's own, not a stamp someone copied", () => {
    /*
     * This replaced a guard that read the lead's `email_verified_at`, which
     * does not mean what it looks like: enrich-lead stamps it with now() even
     * when verifyEmail answered from a weeks-old cache entry. A lead enriched
     * after its bounce could therefore carry a post-bounce-looking stamp over
     * a pre-bounce verdict, and the bounce would skip the check it was owed —
     * leaving a bounced address sitting on a stale `valid`.
     *
     * The cache entry's expiry only moves when something writes the entry,
     * and the entry is only written when an answer is obtained.
     */
    // Still written to the lead; never read back out of it as evidence.
    expect(code).toContain("email_verified_at: new Date().toISOString()");
    for (const sel of code.matchAll(/\.select\("([^"]*)"\)/g)) {
      expect(sel[1], "the lead's stamp is not evidence of a check").not.toContain(
        "email_verified_at",
      );
    }
    const at = VERIFY.indexOf("export async function emailVerificationCheckedAt");
    expect(at, "the reader should exist").toBeGreaterThan(-1);
    const fn = VERIFY.slice(at, VERIFY.indexOf("\nexport ", at + 1));
    expect(fn).toContain('.select("cache_value, expires_at")');
    expect(fn).toContain("`email_verify:${email}`");
    expect(fn).toContain("new Date(expiresAt - CACHE_TTL_SECONDS * 1000)");
    // An expired entry, or one expired on purpose, dates nothing.
    expect(fn).toMatch(/if \(!Number\.isFinite\(expiresAt\) \|\| expiresAt <= Date\.now\(\)\) return null;/);
    // Nor does the invalidation marker, which is not a verdict.
    expect(fn).toContain('!("status" in (value as Record<string, unknown>))');
    // A cache that cannot be read is not evidence of a recent check.
    expect(fn).toMatch(/catch \{[\s\S]*?return null;[\s\S]*?\}/);
  });

  it("every stored verdict is written with the one TTL the date assumes", () => {
    /*
     * `expires_at - CACHE_TTL_SECONDS` only dates the answer while that is
     * the TTL every verdict is written with. A second TTL on any of these
     * writes would make the subtraction quietly wrong, and wrong in the
     * dangerous direction — an answer looking newer than it is skips a check.
     */
    const calls = [...VERIFY.matchAll(/cacheSet\(([\s\S]*?)\);/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(3);
    const verdictWrites = calls.filter((c) => c.includes("email_verify:") || c.includes("cacheKey"));
    expect(verdictWrites.length, "the verdict writes should be found").toBeGreaterThan(3);
    for (const call of verdictWrites) {
      const ttl = call.slice(call.lastIndexOf(",") + 1).trim();
      // -1 is the invalidation, which reads as expired rather than as a date.
      expect(["CACHE_TTL_SECONDS", "-1"], call.slice(0, 60)).toContain(ttl);
    }
  });

  it("the bounce's detection date reaches the rules that need it", () => {
    /*
     * The comparison is only as good as the date it gets. Both entry points
     * have to supply it: the inline path from the DSN's own internalDate,
     * and the sweep from the stored row.
     */
    expect(code).toContain("detectedAt });");
    expect(code).toContain("p.detectedAt)");
    const sweep = code.slice(code.indexOf("const { data: backlog }"));
    expect(sweep).toContain("sent_email_id, detected_at");
    expect(sweep).toContain("b.detected_at as string");
  });

  it("an unanswerable address cannot starve the queue", () => {
    /*
     * 'unknown' leaves the row queued on purpose. Ordered only by detection
     * date, the same addresses would take the whole budget every run while
     * everything behind them waited for ever.
     */
    expect(code).toMatch(/\.update\(\{ reverification_attempted_at: new Date\(\)\.toISOString\(\) \}\)/);
    const sweep = code.slice(code.indexOf("const { data: backlog }"));
    expect(sweep).toMatch(/\.order\("reverification_attempted_at", \{ ascending: true, nullsFirst: true \}\)/);
  });

  it("a bounce is only counted done when the database says so", () => {
    const at = code.indexOf("if (doneErr)");
    expect(at, "an unwritten completion left the row queued and the run calling it finished")
      .toBeGreaterThan(-1);
    expect(code.slice(at, at + 200)).toContain("return false");
  });

  it("the migration gives the queue somewhere to record done", () => {
    const sql = readdirSync("supabase/migrations")
      .filter((f) => f.includes("bounce_reverification_queue"))
      .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
      .join("");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reverified_at timestamptz/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS reverification_attempted_at timestamptz/);
    // Partial, so the index is the size of the backlog, not of all history.
    expect(sql).toMatch(/WHERE reverified_at IS NULL/);
    // And ordered for fairness, or the sweep's rotation has no index to use.
    expect(sql).toMatch(/reverification_attempted_at NULLS FIRST/);
  });
});

describe("the SMTP probe answers honestly or not at all", () => {
  const PROBE = readFileSync("supabase/functions/smtp-capability-probe/index.ts", "utf8");

  it("a failed connection is not proof the platform forbids it", () => {
    /*
     * DNS errors, TLS errors, timeouts and a Gmail outage all fail
     * identically. Reporting those as a platform restriction would retire a
     * buildable design for a reason that was never true.
     */
    /*
     * Three outcomes, and the middle one has to be reachable. Asserting the
     * word "INCONCLUSIVE" appears is not enough — the first version of this
     * passed with the branch hard-wired so the "NO" verdict could never be
     * reached at all.
     */
    const verdict = PROBE.slice(PROBE.indexOf("const verdict ="), PROBE.indexOf("console.log("));
    expect(verdict).toMatch(/results\.some\(\(r\) => r\.reachable\)/);
    expect(verdict).toMatch(/results\.some\(\(r\) => r\.indicatesPlatformBlock\)/);
    expect(verdict).toContain("YES");
    expect(verdict).toContain("NO");
    expect(verdict).toContain("INCONCLUSIVE");

    const at = PROBE.indexOf("function looksLikePlatformBlock");
    expect(at).toBeGreaterThan(-1);
    const fn = PROBE.slice(at, PROBE.indexOf("\nasync function probe", at));
    expect(fn).toContain("PermissionDenied");
    expect(fn).toContain("NotCapable");
  });

  it("a socket that arrives after the timeout is closed", () => {
    // Promise.race picks a winner; it does not cancel the loser. The late
    // connection was never assigned, so `finally` could not close it.
    const at = PROBE.indexOf("const connecting =");
    expect(at, "the connect promise has to be kept to be closed").toBeGreaterThan(-1);
    expect(PROBE).toMatch(/connecting\.then\(\(late\) => \{ try \{ late\.close\(\)/);
  });
});
