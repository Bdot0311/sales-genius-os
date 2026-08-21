import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const SWEEP = read("../../supabase/functions/blacklist-sweep/index.ts");
const ONDEMAND = read("../../supabase/functions/check-blacklists/index.ts");
const SHARED = read("../../supabase/functions/_shared/dnsbl.ts");
const CRON = read("../../supabase/migrations/20260820230000_schedule_blacklist_sweep.sql");

describe("blacklist monitoring actually monitors", () => {
  it("runs on a schedule rather than only when a user clicks", () => {
    expect(CRON).toContain("blacklist-sweep-daily");
    expect(CRON).toContain("/functions/v1/blacklist-sweep");
  });

  it("runs before the alerts scan that reads its results", () => {
    // deliverability-alerts-scan is at 06:15 and raises alerts from the
    // blacklist_checks table. Sweeping after it would report yesterday.
    const [, minute, hour] = CRON.match(/'(\d+) (\d+) \* \* \*'/) ?? [];
    expect(`${hour}:${minute}`).toBe("5:45");
  });

  it("is not left open as an unauthenticated DNS-query trigger", () => {
    expect(SWEEP).toContain("requireServiceRole");
  });
});

describe("one lookup implementation, not two", () => {
  it("both callers use the shared module", () => {
    expect(SWEEP).toContain("checkDomainAgainstDnsbls");
    expect(ONDEMAND).toContain("checkDomainAgainstDnsbls");
  });

  it("the on-demand path no longer carries its own DBL list", () => {
    expect(ONDEMAND).not.toContain("dbl.spamhaus.org");
    expect(SHARED).toContain("dbl.spamhaus.org");
  });
});

describe("honesty about what a lookup proved", () => {
  it("treats a public-resolver refusal as unknown, never as listed", () => {
    // Reading the sentinel as a listing tells a user to tear down a healthy domain.
    expect(SHARED).toContain("127.255.255.");
    expect(SHARED).toContain("Query refused by the DNSBL");
  });

  it("never persists an unknown as history", () => {
    expect(SHARED).toMatch(/filter\(\(r\) => r\.status !== "unknown"\)/);
  });

  it("checks a shared domain once and writes a row per owner", () => {
    // The same domain can be registered by more than one user.
    expect(SWEEP).toContain("owners");
    expect(SWEEP).toContain("flatMap");
  });

  it("says so in the log when the runaway cap truncated the sweep", () => {
    expect(SWEEP).toContain("some domains were not checked");
  });
});
