import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Warmup was erasing the one number it exists to measure.
 *
 * The receive phase records where a warmup message landed, and when it landed
 * in spam it moves it to the inbox. An hour later the next run re-listed the
 * same message, found it in the inbox because *it had put it there*, and
 * overwrote `folder_detected` with 'inbox'. `get_deliverability_live_stats`
 * counts `folder_detected = 'spam'` as `warmup_spam`, and the reputation score
 * deducts up to 25 points on `warmup_spam / (warmup_inbox + warmup_spam)`. So
 * that ratio was pinned at zero: every pooled mailbox read 100% inbox
 * placement however much of its warmup mail was being filtered.
 *
 * Alongside it, the daily target was advisory — count, subtract, insert, with
 * no lock, while the hourly cron and the "run warmup now" button overlap by
 * design — and the receive phase had no wall-clock budget at all.
 */

const SRC = readFileSync("supabase/functions/warmup-orchestrator/index.ts", "utf8");
/** Body only: a comment describing the defect must not satisfy the assertion. */
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIGRATION = readFileSync(
  "supabase/migrations/20261017010000_warmup_claims_and_placement.sql",
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

/** The one CREATE body for a function, not the REVOKE/GRANT that follow it. */
function sqlFunctionBody(sql: string, name: string): string {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(at, `${name} should be defined`).toBeGreaterThan(-1);
  const body = sql.slice(at);
  const end = body.indexOf("$$;");
  expect(end).toBeGreaterThan(-1);
  return body.slice(0, end);
}

describe("placement is observed once, not re-judged every hour", () => {
  it("records where it arrived and never rewrites it", () => {
    const at = code.indexOf("folder_detected: folder");
    expect(at, "placement should still be recorded").toBeGreaterThan(-1);
    const stmt = code.slice(at, code.indexOf(";", at));
    // The guard that stops a recovered message reading as 'inbox' next pass.
    expect(stmt).toContain('.is("folder_detected", null)');
    // Scoped to the recipient, so only the mailbox that received it judges it.
    expect(stmt).toContain('.eq("to_account_id", acct.account_id)');
  });

  it("skips only messages with nothing left to do", () => {
    /*
     * "Already seen" is not "settled", and using the first for the second
     * drops work: a message whose reply hit the per-run cap, or whose
     * recovery failed, had still been seen — and was then filtered out of
     * every later run before anything checked what it still owed.
     */
    expect(code).toContain('.select("id, recipient_message_id, folder_detected, recovered_at, replied_at")');
    const at = code.indexOf("const settled = new Set(");
    expect(at).toBeGreaterThan(-1);
    const filter = code.slice(at, code.indexOf("list.messages", at));
    expect(filter).toContain("!!r.folder_detected");
    // Recorded as spam but not yet moved: still owed a recovery.
    expect(filter).toMatch(/r\.folder_detected !== "spam" \|\| !!r\.recovered_at/);
    // Picked to reply to but not yet replied: still owed a reply.
    expect(filter).toMatch(/!owesReply\(r\.id as string\) \|\| !!r\.replied_at/);
    // And the list is filtered on that, before any per-message Gmail GET.
    const list = code.slice(code.indexOf("list.messages ?? []"));
    expect(list.slice(0, 160)).toContain("settled.has(m.id)");
  });

  it("leaves the mailbox alone when it cannot tell what is settled", () => {
    // Without the set every message is re-judged, which is the defect itself.
    const at = code.indexOf("if (seenErr)");
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 300)).toContain("continue;");
  });

  it("records the reading before acting on it", () => {
    /*
     * Recovering first was the wrong order. The recovery moves the message to
     * the inbox, so a write that then fails — or a concurrent run writing
     * 'inbox' in between — leaves the next pass looking at a message in the
     * inbox because we put it there, with 'spam' never recorded and the
     * `is null` guard making that permanent.
     */
    const recordAt = code.indexOf("folder_detected: folder");
    const recoverAt = code.indexOf("removeLabelIds");
    expect(recordAt).toBeGreaterThan(-1);
    expect(recoverAt).toBeGreaterThan(-1);
    expect(recordAt).toBeLessThan(recoverAt);
    // A reading that was not kept settles nothing; the run stops on it.
    const branch = code.slice(code.indexOf("if (placeErr)"), recoverAt);
    expect(branch).toContain("continue;");
  });

  it("tracks the recovery apart from the reading, so it can retry", () => {
    const at = code.indexOf("recovered_at: new Date().toISOString()");
    expect(at, "nothing distinguished moved-from-spam from still-in-spam").toBeGreaterThan(-1);
    const stmt = code.slice(at, code.indexOf(";", at));
    expect(stmt).toContain('.eq("to_account_id", acct.account_id)');
    expect(stmt).toContain('.is("recovered_at", null)');
    // A failed recovery leaves the message for the next run.
    const fail = code.slice(code.indexOf("if (!modRes.ok)"), at);
    expect(fail).toContain("continue;");
  });

  it("the migration adds both columns the ordering needs", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS recipient_message_id text;/);
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS recovered_at timestamptz;/);
  });

  it("the column it protects is the one the score reads", () => {
    /*
     * Asserted against the live stats function rather than assumed: if the
     * score stopped reading folder_detected, this guard would be protecting
     * a number nothing uses.
     */
    const STATS = readFileSync(
      "supabase/migrations/20260926160000_reputation_drop_open_penalty.sql",
      "utf8",
    );
    expect(STATS).toContain("count(*) FILTER (WHERE w.folder_detected = 'spam') AS warmup_spam");
    expect(STATS).toMatch(/least\(25, CASE WHEN \(b\.warmup_inbox \+ b\.warmup_spam\) > 0/);
  });
});

describe("the daily target is claimed, not computed", () => {
  it("the send phase claims through the function", () => {
    expect(code).toMatch(/\.rpc\("claim_warmup_sends", \{/);
    expect(code).toMatch(/p_from_account: sender\.account_id/);
    expect(code).toMatch(/p_daily_target: sender\.daily_target/);
    // The count-then-insert that two overlapping runs both passed is gone.
    expect(code).not.toMatch(/count: sentToday/);
    expect(code).not.toMatch(/sender\.daily_target - \(sentToday/);
  });

  it("serialises each sender for the length of its transaction", () => {
    const body = sqlFunctionBody(MIGRATION, "claim_warmup_sends");
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtextextended\(p_from_account::text, 0\)\)/);
    // Measured: with the lock removed, two concurrent runs claimed 4 against a
    // target of 2. The lock is the whole fix, so its absence must fail here.
    expect(body.indexOf("pg_advisory_xact_lock")).toBeLessThan(body.indexOf("INTO v_used"));
  });

  it("counts what is in flight, not only what has been sent", () => {
    const body = sqlFunctionBody(MIGRATION, "claim_warmup_sends");
    const count = body.slice(body.indexOf("INTO v_used"), body.indexOf("v_allow :="));
    expect(count).toContain("from_account_id = p_from_account");
    expect(count).toContain("sent_at >= date_trunc('day', now())");
    // Counting only sent rows would let two runs inside one reap window each
    // claim a full allowance.
    expect(count).not.toMatch(/gmail_message_id IS NOT NULL/);
  });

  it("hands back claims no live run can be holding", () => {
    const body = sqlFunctionBody(MIGRATION, "claim_warmup_sends");
    const reap = body.slice(body.indexOf("DELETE FROM public.warmup_messages"), body.indexOf("INTO v_used"));
    expect(reap).toContain("gmail_message_id IS NULL");
    expect(reap).toMatch(/sent_at < now\(\) - interval '10 minutes'/);
    // Otherwise a run killed mid-send shrinks that sender's ramp for the day.
    expect(body.indexOf("DELETE FROM public.warmup_messages")).toBeLessThan(body.indexOf("INTO v_used"));
  });

  it("cannot be called by the user who pressed the button", () => {
    /*
     * The endpoint accepts any signed-in user, for the whole shared pool. The
     * run is theirs to trigger; the rows are not theirs to mint.
     */
    const body = sqlFunctionBody(MIGRATION, "claim_warmup_sends");
    expect(body).toMatch(/IF auth\.role\(\) <> 'service_role' THEN/);
    expect(MIGRATION).toMatch(
      /REVOKE ALL ON FUNCTION public\.claim_warmup_sends\(uuid, uuid\[\], integer, integer\) FROM PUBLIC, anon, authenticated;/,
    );
  });

  it("drops a claim it could not send", () => {
    // A claim left behind spends the allowance on a message that never left.
    const at = code.indexOf("const result = await gmailSend(token, sender.email");
    expect(at).toBeGreaterThan(-1);
    const tail = code.slice(at, at + 600);
    expect(tail).toContain("sent++;");
    expect(tail).toMatch(
      /\} else \{\s+await supabase\.from\("warmup_messages"\)\.delete\(\)\.eq\("id", row\.id\);\s+\}/,
    );
  });
});

describe("replies are sends, and are capped like sends", () => {
  it("has a per-day and per-run allowance", () => {
    const at = code.indexOf("let replyAllowance");
    expect(at, "replies had no cap at all: 25 a run, every hour").toBeGreaterThan(-1);
    const stmt = code.slice(at, code.indexOf(";", at));
    expect(stmt).toContain("acct.daily_target");
    expect(stmt).toContain("repliedToday");
    expect(stmt).toMatch(/Math\.min\(2,/);
  });

  it("an unreadable count means no replies, not a fresh allowance", () => {
    /*
     * `repliedToday ?? 0` handed the mailbox its whole allowance back every
     * time the query failed, which is the cap failing open — a transient
     * database error buying more Gmail sends after the cap was spent.
     */
    const at = code.indexOf("let replyAllowance");
    const stmt = code.slice(at, code.indexOf(";", at));
    expect(stmt).toMatch(/repliedErr \|\| typeof repliedToday !== "number"/);
    expect(code).not.toMatch(/repliedToday \?\? 0/);
  });

  it("counts this mailbox's own replies for today", () => {
    const at = code.indexOf("count: repliedToday");
    expect(at).toBeGreaterThan(-1);
    const stmt = code.slice(at, code.indexOf(";", at));
    // The replier is the recipient of the original message.
    expect(stmt).toContain('.eq("to_account_id", acct.account_id)');
    expect(stmt).toMatch(/\.not\("replied_at", "is", null\)/);
    expect(stmt).toMatch(/\.gte\("replied_at", `\$\{today\}T00:00:00Z`\)/);
  });

  it("spends the allowance and stops when it is gone", () => {
    expect(code).toMatch(/replyAllowance > 0/);
    expect(code).toMatch(/replyAllowance--;/);
  });

  it("chooses which to reply to by the message, not by list position", () => {
    /*
     * `m % 2 === 0` keyed the decision to a position that shifts between runs,
     * so nothing later could ask whether a given message was owed a reply.
     * One named predicate now, used by the sender and by the skip set.
     */
    expect(code).not.toMatch(/m % 2 === 0/);
    expect(code).toMatch(/function owesReply\(wmId: string\): boolean \{\s*return parseInt\(wmId\.slice\(0, 8\), 16\) % 2 === 0;/);
    expect(code).toMatch(/if \(wmId && owesReply\(wmId\) && replyAllowance > 0\)/);
  });
});

describe("a run that cannot finish stops rather than being killed", () => {
  it("has a wall-clock budget", () => {
    expect(code).toMatch(/const BUDGET_MS = \d+_?\d*;/);
    expect(code).toMatch(/const outOfTime = \(\) => Date\.now\(\) - startedAt > BUDGET_MS;/);
  });

  it("checks the budget at the top of every loop that costs a round trip", () => {
    /*
     * Counting the checks is not enough: three of the four would still be
     * there with the per-message loop left unbounded, and that loop is the one
     * that multiplies — a Gmail GET per message, per mailbox, per run.
     */
    const loops = [
      "for (let i = 0; i < sendable.length; i++) {",
      "for (let r = 0; r < rows.length; r++) {",
      "for (const acct of scanOrder) {",
      "for (let m = 0; m < msgs.length; m++) {",
    ];
    for (const loop of loops) {
      const at = code.indexOf(loop);
      expect(at, `${loop} should exist`).toBeGreaterThan(-1);
      expect(code.slice(at + loop.length, at + loop.length + 60), loop).toContain("if (outOfTime())");
    }
  });

  it("scans least-recently-scanned first", () => {
    /*
     * Without an order, a pool bigger than one run can scan would only ever
     * scan the mailboxes at the front of it.
     */
    const at = code.indexOf("const scanOrder");
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, code.indexOf("let scanned", at))).toContain("last_scan_at");
    expect(code).toMatch(/\.from\("warmup_pool"\)\.update\(\{ last_scan_at: new Date\(\)\.toISOString\(\) \}\)/);
    expect(code).toContain("daily_target, last_scan_at");
  });

  it("says so in the response instead of leaving it to be inferred", () => {
    expect(code).toMatch(/scanned, budgetHit: ranOut,/);
  });
});
