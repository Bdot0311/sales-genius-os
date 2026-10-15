import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * The sender could send the same email twice.
 *
 * `process-scheduled-emails` is scheduled every minute. It read twenty rows at
 * `status = 'scheduled'` with no claim, walked them one at a time sending
 * each, and wrote `status = 'sent'` only after Gmail answered — never looking
 * at the row again in between. It also had no wall clock, so a run was free to
 * outlive the cron interval. Two overlapping runs read the same rows and both
 * sent them, and the first run sent them again when it reached them, because
 * nothing checked.
 *
 * A duplicate cold email cannot be taken back, and it is the kind of thing a
 * domain gets complained about for. What is pinned here is the ordering and
 * the branches that make a repeat impossible, verified against a real
 * Postgres 16 cluster before being written down.
 */

const SENDER = readFileSync("supabase/functions/process-scheduled-emails/index.ts", "utf8");

/** Body only. A comment quoting code must not satisfy an assertion about it. */
const code = SENDER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const MIGRATIONS = "supabase/migrations";
const migration = readFileSync(
  `${MIGRATIONS}/${
    readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) =>
        readFileSync(`${MIGRATIONS}/${f}`, "utf8")
          .includes("FUNCTION public.release_stale_scheduled_email_claims")
      )
      .pop()
  }`,
  "utf8",
);
const sql = migration.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

describe("the sender takes its work rather than reading it", () => {
  it("claims through the RPC", () => {
    expect(code).toContain('rpc("claim_due_scheduled_emails"');
  });

  it("no longer selects due rows directly", () => {
    // The defect in one expression. Any read of 'scheduled' rows that is not a
    // claim is a snapshot two runs can share.
    expect(code).not.toMatch(/from\("sent_emails"\)[\s\S]{0,200}?\.eq\("status",\s*"scheduled"\)/);
  });

  it("sweeps stale claims before taking more", () => {
    // A claimed row is invisible to the claim, so without this a killed run's
    // emails would never go out at all — trading a duplicate for a silent drop
    // is not a fix.
    expect(code).toContain('rpc("release_stale_scheduled_email_claims")');
    expect(code.indexOf('rpc("release_stale_scheduled_email_claims")'))
      .toBeLessThan(code.indexOf('rpc("claim_due_scheduled_emails"'));
  });
});

describe("the mutex sits before the irreversible call", () => {
  const beginAt = code.indexOf('rpc("begin_scheduled_email_send"');
  const gmailAt = code.indexOf("gmail.googleapis.com/gmail/v1/users/me/messages/send");

  it("is called at all", () => {
    expect(beginAt).toBeGreaterThan(-1);
    expect(gmailAt).toBeGreaterThan(-1);
  });

  it("comes before the send, not after it", () => {
    // After the POST it would record history, not prevent anything.
    expect(beginAt).toBeLessThan(gmailAt);
  });

  it("gives up the email when it loses the race", () => {
    // Losing means another run holds it. Sending anyway is the duplicate.
    const between = code.slice(beginAt, gmailAt);
    expect(between).toMatch(/length === 0[\s\S]*?continue;/);
  });
});

describe("a run that stops hands its claims back", () => {
  it("stops on a wall clock instead of being killed", () => {
    // A killed run cannot release anything, so the budget is what keeps
    // unreached emails out of the fifteen-minute sweep.
    expect(code).toMatch(/const BUDGET_MS = \d+_?\d*;/);
    expect(code).toMatch(/if \(outOfTime\(\)\) \{\s*releaseLater\.add\(email\.id\);/);
  });

  it("releases on the budget stop, on a deferral, and on a throw", () => {
    // A deferral leaves the row 'scheduled' on purpose — a reached cap is
    // retryable — but it is claimed, so the next run cannot see it.
    expect((code.match(/releaseLater\.add\(email\.id\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((code.match(/await handBackClaims\(\)/g) ?? []).length).toBe(2);
  });
});

describe("an interrupted send is never repeated", () => {
  /*
   * The one judgement call in this change, and the reason there are two
   * timestamps instead of one. A claim left unsettled is ambiguous: the run
   * may have died before reaching the row, or after the POST and before the
   * status write. Those need opposite handling, and only `send_attempted_at`
   * can tell them apart.
   */
  it("hands back a claim that was never attempted", () => {
    expect(sql).toMatch(
      /SET send_claimed_at = NULL[\s\S]{0,200}?AND send_attempted_at IS NULL/,
    );
  });

  it("fails an attempted one rather than retrying it", () => {
    const attempted = sql.slice(sql.indexOf("AND send_attempted_at IS NOT NULL"));
    expect(sql).toMatch(/SET status = 'failed'[\s\S]{0,600}?AND send_attempted_at IS NOT NULL/);
    // And never puts it back where the claim could pick it up again.
    expect(attempted).not.toMatch(/SET send_claimed_at = NULL/);
    expect(attempted).not.toMatch(/status = 'scheduled'\s*,/);
  });

  it("says so in words the person can act on", () => {
    // They are the only one who can check whether it arrived.
    expect(sql).toMatch(/could not confirm/i);
    expect(sql).toMatch(/resend/i);
  });
});

describe("the send queue is fair across accounts too", () => {
  it("round-robins by account and keeps due order within one", () => {
    // Twenty sends a minute is the whole product's capacity. Ordered by due
    // time alone, one account's backlog owns all of it.
    expect(sql).toMatch(/row_number\(\) OVER \(ORDER BY c\.scheduled_at, c\.id\) AS turn/);
    expect(sql).toMatch(/ORDER BY x\.turn/);
    expect(sql).toMatch(/c\.user_id = t\.user_id/);
  });

  it("keeps concurrent runs disjoint", () => {
    expect(sql).toContain("FOR UPDATE OF c SKIP LOCKED");
  });
});

describe("cancelling says what actually happened", () => {
  /*
   * Both cancel paths guarded on status alone, and the sender never re-read
   * status between taking a row and posting it. So cancelling an email in
   * flight reported success and the email arrived — and through the agent it
   * was worse: the row was deleted, so the send left no record at all, which
   * silently breaks the reply tracking and the don't-follow-up-within-N-hours
   * guard that read it.
   */
  const DIALOG = readFileSync("src/components/outreach/EditScheduledEmailDialog.tsx", "utf8");
  const AGENT = readFileSync("supabase/functions/agent-chat/index.ts", "utf8");
  const cancelTool = AGENT.slice(
    AGENT.indexOf('case "cancel_scheduled_email"'),
    AGENT.indexOf('case "send_outreach"'),
  );

  it("refuses in the dialog once the send has started", () => {
    expect(DIALOG).toMatch(/update\(\{ status: "cancelled" \}\)[\s\S]{0,200}?\.is\("send_attempted_at", null\)/);
  });

  it("tells the user instead of claiming it was cancelled", () => {
    expect(DIALOG).toContain("This one has already gone");
  });

  it("will not edit a message a run is already sending", () => {
    // An edit that lands after the claim changes the row and nothing about
    // what goes out, which read as "Email updated" for unsent text.
    expect(DIALOG).toMatch(/body_html: htmlBody[\s\S]{0,400}?\.is\("send_claimed_at", null\)/);
    expect(DIALOG).toContain("Too late to edit this one");
  });

  it("never deletes the row of a send already in flight", () => {
    // The delete is the only record that the email went out.
    expect(cancelTool).toMatch(/\.delete\(\)[\s\S]{0,300}?\.is\("send_attempted_at", null\)/);
    expect(cancelTool).toContain("alreadyGone.push(r.id)");
  });

  it("tells the model to report those as sent, not cancelled", () => {
    expect(cancelTool).toContain("already_sending");
    expect(cancelTool).toMatch(/rather than that they were cancelled/);
  });
});
