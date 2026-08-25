import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const CONFIG = readFileSync("src/components/agent/ConfigTab.tsx", "utf8");
const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");
const APP = readFileSync("src/App.tsx", "utf8");

/**
 * Two different daily limits, one of which does nothing about sending.
 *
 * "Max new emails per day" in the agent config governs how many first-touch
 * emails the agent COMPOSES. subscriptions.daily_email_limit is what
 * send-email actually enforces, defaults to 10, and lives on a different page.
 * A user set the agent field to 100, hit the 10/day account cap, and had 25
 * approved emails refuse to send with nothing on that screen explaining why.
 */
describe("the agent's email cap names the limit that actually applies", () => {
  it("reads the account-wide cap", () => {
    expect(CONFIG).toContain("daily_email_limit");
    expect(CONFIG).toContain("accountDailyCap");
  });

  it("warns when the agent setting exceeds what the account can send", () => {
    expect(CONFIG).toContain("Number(maxDailyNewEmails) > accountDailyCap");
    expect(CONFIG).toContain("cannot\n                      take effect above that");
  });

  it("links to the page that actually owns the limit", () => {
    expect(CONFIG).toContain('to="/dashboard/outreach"');
  });

  it("links to a route that exists", () => {
    // /outreach is not a route; the page is mounted under /dashboard.
    expect(APP).toContain('path="/dashboard/outreach"');
    expect(CONFIG).not.toContain('to="/outreach"');
  });
});

describe("send-email still points at the right place when it refuses", () => {
  it("names the limit and where to change it", () => {
    expect(SEND).toContain("Daily email limit reached");
    expect(SEND).toContain("Outreach settings");
  });

  it("defaults the cap to 10 when the subscription carries none", () => {
    expect(SEND).toContain("subscription.daily_email_limit || 10");
  });
});
