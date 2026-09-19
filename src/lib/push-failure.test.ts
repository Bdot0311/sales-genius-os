import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyProviderReason,
  describePushFailure,
  providerReasonCode,
} from "../../supabase/functions/_shared/push-failure";
import { checkVapidSubject } from "../../supabase/functions/_shared/vapid-keypair";

const FN = readFileSync("supabase/functions/send-push-notification/index.ts", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

/**
 * A 401 or 403 from the push service does not say whose fault it is.
 *
 * Apple and Google answer with the same status whether the signature we made
 * was rejected or the device we made it for is gone. Picking advice from the
 * status alone is a coin flip, and the wrong side of it sends someone to
 * re-register a device that was never the problem. The reason is in the body.
 */
describe("the provider's own reason decides whose problem it is", () => {
  it("reads Apple's code out of its body", () => {
    expect(providerReasonCode('{"reason":"BadJwtToken"}')).toBe("BadJwtToken");
    expect(providerReasonCode('{"reason":"BadDeviceToken"}')).toBe("BadDeviceToken");
  });

  it("copes with a body that is not JSON, which Apple has been known to send", () => {
    expect(providerReasonCode("BadDeviceToken")).toBe("BadDeviceToken");
    expect(providerReasonCode("")).toBeNull();
    expect(providerReasonCode(undefined)).toBeNull();
  });

  it("calls a token complaint ours, because no device can cause one", () => {
    for (const c of ["BadJwtToken", "ExpiredProviderToken", "InvalidProviderToken", "TopicDisallowed"]) {
      expect(classifyProviderReason(c), c).toBe("ours");
    }
  });

  it("calls a device complaint the device's, where re-registering is the fix", () => {
    for (const c of ["BadDeviceToken", "Unregistered", "ExpiredToken"]) {
      expect(classifyProviderReason(c), c).toBe("device");
    }
  });

  it("calls a rate complaint neither, since it clears on its own", () => {
    expect(classifyProviderReason("TooManyRequests")).toBe("transient");
  });

  it("does not guess when there is no code", () => {
    expect(classifyProviderReason(null)).toBe("unknown");
    expect(classifyProviderReason("SomethingNewApplesShipped")).toBe("unknown");
  });

  it("never sends someone to re-register over a signing problem", () => {
    const ours = describePushFailure(403, "BadJwtToken");
    expect(ours).toContain("ours to fix");
    expect(ours).not.toContain("Turn the switch off and on");
  });

  it("does send them to re-register when the device really is gone", () => {
    expect(describePushFailure(403, "BadDeviceToken")).toContain("Turn the switch off and on");
  });

  it("says both when the provider gave no code, rather than picking one", () => {
    const vague = describePushFailure(403, null);
    expect(vague).toContain("Turn the switch off and on");
    expect(vague).toContain("ours to fix");
  });

  it("puts the code in the sentence, so the next report diagnoses itself", () => {
    expect(describePushFailure(403, "BadJwtToken")).toContain("(BadJwtToken)");
  });
});

/**
 * The subject is the other half of a valid VAPID token, and it is a settable
 * secret. A bare email or a bare domain is a 403 on every send — the same dead
 * end as a mismatched key, from a different cause.
 */
describe("the VAPID subject is checked too", () => {
  it("accepts what the spec allows", () => {
    expect(checkVapidSubject("mailto:support@bdotindustries.com")).toEqual({ ok: true });
    expect(checkVapidSubject("https://outreign.io")).toEqual({ ok: true });
  });

  it("rejects the shapes that produce a 403 on every send", () => {
    expect(checkVapidSubject("support@bdotindustries.com").ok).toBe(false);
    expect(checkVapidSubject("outreign.io").ok).toBe(false);
    expect(checkVapidSubject("http://outreign.io").ok).toBe(false);
    expect(checkVapidSubject("").ok).toBe(false);
    expect(checkVapidSubject("mailto:nope").ok).toBe(false);
  });

  it("gives every configuration failure its own sentence", () => {
    // These shared one message — "not configured correctly on our side" — for
    // a missing key, a malformed key and a bad subject alike. A screenshot of
    // it could not say which, so the operator still had to go log-diving,
    // which is the round trip this whole check exists to remove.
    const fn = code(FN);
    const messages = [
      ...fn.matchAll(/"(The signing key[^"]+|The contact address[^"]+|Notifications are signed[^"]+)"/g),
    ].map((m) => m[1]);
    expect(messages.length).toBeGreaterThanOrEqual(4);
    expect(new Set(messages).size, "each cause needs its own wording").toBe(messages.length);
    // And each still says whose problem it is.
    for (const message of messages) {
      expect(message, message.slice(0, 40)).toContain("ours to fix");
    }
  });

  it("is checked before anything is signed", () => {
    const fn = code(FN);
    expect(fn).toContain("checkVapidSubject(VAPID_SUBJECT)");
    expect(fn.indexOf("checkVapidSubject")).toBeLessThan(fn.indexOf("webpush.setVapidDetails"));
  });

  it("is reported as ours, not as a device to re-register", () => {
    const block = code(FN).slice(
      code(FN).indexOf("if (!subjectCheck.ok)"),
      code(FN).indexOf("webpush.setVapidDetails"),
    );
    expect(block).toContain("this one is ours to fix");
    expect(block).not.toContain("Turn the switch off and on");
  });

  it("hands the provider code to the message rather than deciding from the status", () => {
    const fn = code(FN);
    expect(fn).toContain("describePushFailure(statuses[0] ?? null, codes[0] ?? null)");
    expect(fn).toContain("providerReasonCode(body)");
  });
});
