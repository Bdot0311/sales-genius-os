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

describe("resolve_approvals reports sends, not attempts", () => {
  const SRC = readFileSync(
    new URL("../../supabase/functions/agent-chat/index.ts", import.meta.url),
    "utf8",
  );

  it("no longer returns an attempt count under the name 'resolved'", () => {
    // `resolved: outcomes.length` counted every approval tried, and the model
    // read it as every approval sent.
    expect(SRC).not.toContain("resolved: outcomes.length");
  });

  it("returns a real sent count", () => {
    expect(SRC).toMatch(/sent:\s*decision === "approve" \? sentCount : 0/);
    expect(SRC).toContain("attempted: outcomes.length");
  });

  it("carries an error when anything failed, so the send is not marked complete", () => {
    // didMutate() returns false on a result with an error, which stops a failed
    // batch being recorded as a finished mutation.
    expect(SRC).toContain("could not be sent and are still pending");
  });

  it("stops labelling a total failure as 'Sent what you approved'", () => {
    expect(SRC).toContain("Nothing sent — every send failed");
  });

  it("tells the model not to claim a failed send succeeded", () => {
    expect(SRC).toContain("Do NOT say they were sent");
  });
});

describe("the scheduler stops skipping emails in silence", () => {
  const SRC = readFileSync(
    new URL("../../supabase/functions/process-scheduled-emails/index.ts", import.meta.url),
    "utf8",
  );

  it("records a reason for every branch that skips a send", () => {
    // Four branches used to `continue` with nothing but a console.log, so a
    // run that sent one of two queued emails looked like a clean run.
    const defers = SRC.match(/defer\(email, /g) ?? [];
    expect(defers.length).toBe(4);
  });

  it("no longer counts a skipped email as neither processed nor failed", () => {
    expect(SRC).toContain("deferred: deferrals.length");
    expect(SRC).toContain("deferrals,");
  });

  it("names the causes a user can act on", () => {
    expect(SRC).toContain("daily send limit is reached");
    expect(SRC).toContain("monthly send cap is reached");
    expect(SRC).toContain("Resume it on the Deliverability page");
    expect(SRC).toContain("at its daily cap");
  });
});
