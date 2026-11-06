import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PROC = readFileSync("supabase/functions/process-scheduled-emails/index.ts", "utf8");
const TABLE = readFileSync("src/components/outreach/SentEmailsTable.tsx", "utf8");
const MIGRATION = readFileSync(
  "supabase/migrations/20260916003000_sent_email_failure_reason.sql",
  "utf8",
);

/**
 * A red "Failed" badge that cannot say why.
 *
 * process-scheduled-emails can fail a send seven different ways. Every one of
 * them wrote `status = 'failed'` and sent the actual reason to console.error,
 * which lands in the edge function log. So the Sent tab showed the badge and
 * nothing else, and finding the cause meant an operator reading logs — for
 * causes like an expired Google connection that the user could fix themselves
 * in a minute if anything told them.
 */
describe("a failed send says why", () => {
  it("has somewhere to put the reason", () => {
    expect(MIGRATION).toContain("add column if not exists error_message text");
    expect(MIGRATION).toContain("add column if not exists failed_at timestamptz");
  });

  it("can be applied twice, since applied migrations get re-run here", () => {
    expect(MIGRATION).toContain("add column if not exists");
    expect(MIGRATION).toContain("create index if not exists");
  });

  it("indexes only the failures, not every row ever sent", () => {
    expect(MIGRATION).toContain("where status = 'failed'");
  });

  it("writes the reason through one helper, so a new path cannot forget", () => {
    expect(PROC).toContain("const failEmail = async (emailId: string, reason: string)");
    expect(PROC).toContain("error_message: reason");
    expect(PROC).toContain("failed_at: new Date().toISOString()");
  });

  it("leaves no path that fails a send silently", () => {
    // Nine: the original eight, plus a saved template whose claims are not in
    // the lead research. That one is failed before Gmail is called.
    expect(PROC.match(/await failEmail\(/g) ?? []).toHaveLength(9);
    expect(PROC).toContain("ungrounded_template");
    expect(PROC).not.toMatch(/from\(["']sent_emails["']\)[\s\S]{0,80}?update\(\{ status: ["']failed["'] \}\)/);
  });

  it("names the cause the user can actually act on", () => {
    // Two of the eight are the user's own Google connection having expired.
    expect(PROC).toContain("invalid_grant");
    expect(PROC).toContain("Reconnect Google on the Integrations page");
  });

  it("owns the one that is not the user's fault", () => {
    expect(PROC).toContain("Nothing is wrong with your account");
  });

  it("keeps the provider's own words, trimmed", () => {
    // A Gmail refusal is worth quoting; the raw JSON body is not.
    expect(PROC).toContain("error?.message");
    expect(PROC).toContain(".slice(0, 160)");
  });

  it("still logs the raw text for whoever is debugging", () => {
    expect(PROC).toContain("console.error(`Gmail error for email");
  });
});

describe("the sent table", () => {
  it("shows the reason on the row that failed", () => {
    expect(TABLE).toContain("error_message");
    expect(TABLE).toContain('email.status === "failed" && email.error_message');
  });

  it("stops describing a failure as still on its way", () => {
    // A failed send has no sent_at, so the timestamp fell through to
    // scheduled_at and rendered "in about 21 hours" — future tense, for
    // something that had already failed.
    expect(TABLE).toContain("email.failed_at");
    expect(TABLE).toContain("`failed ${formatDistanceToNow(new Date(email.failed_at)");
  });

  it("orders failures by when they failed", () => {
    expect(TABLE).toContain("email.sent_at || email.failed_at || email.scheduled_at");
  });

  it("selects the columns it renders", () => {
    // The typecheck catches a column that does not exist, but not one that
    // exists and was never asked for — that renders as undefined.
    expect(TABLE).toContain("error_message, failed_at");
  });
});
