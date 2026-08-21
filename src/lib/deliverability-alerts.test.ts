import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const SCAN = read("../../supabase/functions/deliverability-alerts-scan/index.ts");
const TEMPLATE = read("../../supabase/functions/_shared/transactional-email-templates/deliverability-alert.tsx");
const REGISTRY = read("../../supabase/functions/_shared/transactional-email-templates/registry.ts");
const MIGRATION = read("../../supabase/migrations/20260821090000_deliverability_alert_notifications.sql");

describe("critical alerts reach the user, not just the dashboard", () => {
  it("sends mail rather than only writing a row", () => {
    expect(SCAN).toContain("send-transactional-email");
    expect(SCAN).toContain("deliverability-alert");
  });

  it("is registered as a real template", () => {
    expect(REGISTRY).toContain("'deliverability-alert': deliverabilityAlert");
  });

  it("emails the affected user, not the support inbox", () => {
    // send-system-alert exists but goes to admins — wrong audience for
    // "your domain is blacklisted".
    expect(SCAN).toMatch(/from\(\s*"profiles"\s*\)/);
    expect(SCAN).toContain("recipientEmail: profile.email");
  });
});

describe("not becoming noise", () => {
  it("emails only critical severity", () => {
    // A product that emails about every warning teaches people to filter the
    // one message that mattered.
    expect(SCAN).toMatch(/eq\(\s*"severity",\s*"critical"\s*\)/);
  });

  it("emails each alert once", () => {
    expect(MIGRATION).toContain("notified_at");
    expect(SCAN).toMatch(/is\(\s*"notified_at",\s*null\s*\)/);
    expect(SCAN).toContain("notified_at: new Date().toISOString()");
  });

  it("groups a user's alerts into one email", () => {
    // Three listed domains is one problem to act on; three emails reads as a
    // broken system.
    expect(SCAN).toContain("byUser");
    expect(SCAN).toContain("issues: alerts.map");
  });
});

describe("failure does not lose the alert", () => {
  it("stamps only after the send succeeded", () => {
    const sendAt = SCAN.indexOf("if (sendErr)");
    const stampAt = SCAN.indexOf("notified_at: new Date().toISOString()");
    expect(sendAt).toBeGreaterThan(-1);
    expect(stampAt).toBeGreaterThan(sendAt);
    expect(SCAN).toContain("continue; // unstamped, so the next run tries again");
  });

  it("leaves a user with no address unstamped rather than skipping forever", () => {
    expect(SCAN).toContain("if (!profile?.email) continue;");
  });

  it("never lets the notify pass break the scan itself", () => {
    expect(SCAN).toContain("notify pass failed (non-fatal)");
  });
});

describe("the email tells the reader what to do", () => {
  it("carries a remedy per issue type, not just a status", () => {
    // "You are on Spamhaus" tells you nothing about delisting being free and
    // self-service.
    expect(TEMPLATE).toContain("NEXT_STEP");
    for (const type of ["blacklist", "reputation_drop", "auth_failure"]) {
      expect(TEMPLATE, type).toContain(`${type}:`);
    }
  });

  it("tells a blacklisted sender to stop sending", () => {
    expect(TEMPLATE).toMatch(/Stop sending from this domain/i);
  });

  it("has a subject naming the actual problem", () => {
    expect(TEMPLATE).toContain("subject:");
    expect(TEMPLATE).toContain("deliverability problems on your sending domains");
  });
});
