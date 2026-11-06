import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { countsAsSent } from "./counted-as-sent";

const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");
const STATS = readFileSync("src/components/outreach/EmailPerformanceStats.tsx", "utf8");
const ANALYTICS = readFileSync("src/pages/Analytics.tsx", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * A message Gmail refused, counted as sent.
 *
 * The immediate-send path stamped `sent_at` on the row it was marking
 * `failed`. Both metric surfaces treat any row carrying `sent_at` as a send,
 * so each failure landed in the send total and in the failure total at once —
 * and every rate measured against that total came out low.
 */
describe("a refused message is not a send", () => {
  // The reservation is marked failed after Gmail refuses. It must not keep a
  // send time, or the metrics count a refusal as a delivery.
  const failedWrite = () => {
    const src = code(SEND);
    const at = src.indexOf("markFailed: async");
    return src.slice(at, src.indexOf("},", at));
  };

  it("does not stamp a send time on a failure", () => {
    const block = failedWrite();
    expect(block).toContain("status: 'failed'");
    expect(block).toContain("sent_at: null");
    expect(block).toContain("failed_at: new Date().toISOString()");
  });

  it("says why, the way the scheduled path already does", () => {
    const block = failedWrite();
    expect(block).toContain("error_message: reason");
    expect(code(SEND)).toContain("Reconnect Google on the Integrations page");
  });

  it("is decided in one place, by status rather than by timestamp", () => {
    expect(code(STATS)).toContain("emails.filter(countsAsSent)");
    expect(code(ANALYTICS)).toContain("emails.filter(countsAsSent)");
  });

  it("rules out a failure even on rows written before the fix", () => {
    // Those rows still carry the sent_at the old code stamped on them.
    expect(countsAsSent({ status: "failed", sent_at: "2026-09-15T09:00:00Z" })).toBe(false);
  });

  it("still counts the sends, including the ones whose status moved on", () => {
    expect(countsAsSent({ status: "sent", sent_at: null })).toBe(true);
    expect(countsAsSent({ status: "replied", sent_at: "2026-09-15T09:00:00Z" })).toBe(true);
    // A bounce is a message that left.
    expect(countsAsSent({ status: "bounced", sent_at: "2026-09-15T09:00:00Z" })).toBe(true);
  });

  it("does not count a message still waiting to go out", () => {
    expect(countsAsSent({ status: "scheduled", sent_at: null })).toBe(false);
  });
});
