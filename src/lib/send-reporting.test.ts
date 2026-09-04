import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { asFnResult } from "../../supabase/functions/_shared/fn-result.ts";

/**
 * The agent reported two emails as sent that never arrived. Every caller here
 * decides success with `!r?.error`, so anything that reaches them without that
 * key is a send recorded that never happened.
 */
describe("a failed function call is never read as success", () => {
  const failed = (r: Record<string, unknown>) => Boolean(r.error);

  it("treats a Supabase BOOT_ERROR as a failure", () => {
    // The real shape: no "error" key anywhere in it.
    const r = asFnResult("send-email", 503, false, '{"code":"BOOT_ERROR","message":"worker failed to boot"}');
    expect(failed(r)).toBe(true);
    expect(r.error).toContain("worker failed to boot");
  });

  it("treats a worker-limit 546 as a failure", () => {
    const r = asFnResult("send-email", 546, false, "");
    expect(failed(r)).toBe(true);
    expect(r.error).toContain("546");
  });

  it("treats an HTML gateway error page as a failure", () => {
    const r = asFnResult("send-email", 504, false, "<html><body>Gateway Timeout</body></html>");
    expect(failed(r)).toBe(true);
  });

  it("keeps the reason the function actually gave", () => {
    const r = asFnResult("send-email", 429, false, '{"error":"Daily email limit reached (10/day).","code":"daily_cap_reached"}');
    expect(r.error).toBe("Daily email limit reached (10/day).");
    expect(r.code).toBe("daily_cap_reached");
    expect(r.http_status).toBe(429);
  });

  it("does not invent a failure on a real success", () => {
    const r = asFnResult("send-email", 200, true, '{"success":true,"messageId":"abc"}');
    expect(failed(r)).toBe(false);
    expect(r.messageId).toBe("abc");
  });

  it("still respects a 200 that carries its own error", () => {
    // generate-email reports refusals this way on purpose.
    const r = asFnResult("generate-email", 200, true, '{"error":"placeholder","error_code":"placeholder"}');
    expect(failed(r)).toBe(true);
  });

  it("refuses to call an empty 200 a success", () => {
    expect(failed(asFnResult("send-email", 200, true, ""))).toBe(true);
  });

  it("does not crash on a JSON array body", () => {
    const r = asFnResult("send-email", 500, false, "[1,2,3]");
    expect(failed(r)).toBe(true);
  });
});

/**
 * The queue that this described is retired, but the rule it enforced is not:
 * a count of what was ATTEMPTED must never be returned under a name the model
 * will read as what was SENT. That was `resolved: outcomes.length`, and it is
 * now send_drafts' own accounting.
 */
describe("the send path reports sends, not attempts", () => {
  const SRC = readFileSync(
    new URL("../../supabase/functions/agent-chat/index.ts", import.meta.url),
    "utf8",
  );

  it("never labels an attempt count as a send", () => {
    expect(SRC).not.toContain("resolved: outcomes.length");
    expect(SRC).toContain("attempted: results.length");
  });

  it("returns sent, failed and requested as separate numbers", () => {
    // One number cannot answer "did it go" and "how many did you try".
    expect(SRC).toMatch(/sent: sentCount/);
    expect(SRC).toMatch(/failed: failedCount/);
    expect(SRC).toMatch(/requested: requestedCount \|\| drafts\.length/);
  });

  it("says plainly when nothing was sent because it is awaiting confirmation", () => {
    expect(SRC).toContain("NOTHING WAS SENT");
    expect(SRC).toContain("Nothing is queued or stored");
  });

  it("names per-record failures rather than folding them into a total", () => {
    expect(SRC).toContain("did NOT go out");
  });
});
