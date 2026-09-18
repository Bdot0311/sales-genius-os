import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const PUSH = readFileSync("src/lib/push.ts", "utf8");
const TAB = readFileSync("src/components/settings/NotificationsTab.tsx", "utf8");
const FN = readFileSync("supabase/functions/send-push-notification/index.ts", "utf8");

/** Source with comments removed, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * A switch that said "This device is registered for notifications" above a
 * green tick reading "Test sent to 0 device(s)".
 *
 * Two halves have to agree for a push to arrive: the browser's subscription and
 * the `push_subscriptions` row the sender reads. Settings decided from the
 * browser half alone, which survives the row being pruned as stale, lost with a
 * session, or never written — so the switch sat on while every notification
 * went nowhere, and the test reported that as a success.
 */
describe("the notification switch tells the truth", () => {
  it("decides from the row the sender reads, not from the browser alone", () => {
    expect(code(TAB)).toContain("getDeviceStatus");
    expect(code(TAB)).not.toContain("getCurrentSubscription");
    expect(code(PUSH)).toContain("isRegisteredOnServer");
  });

  it("writes the missing row back instead of asking the user to re-toggle", () => {
    const status = code(PUSH).split("export async function getDeviceStatus")[1] ?? "";
    expect(status).toContain("await storeSubscription(subscription)");
    expect(status).toContain("registered: true");
  });

  it("repairs on load, not only when someone opens Settings", () => {
    const refresh = code(PUSH).split("export async function refreshPushSubscription")[1] ?? "";
    expect(refresh).toContain("await getDeviceStatus()");
  });

  it("reports a repair that failed as unregistered rather than claiming it worked", () => {
    const status = code(PUSH).split("export async function getDeviceStatus")[1] ?? "";
    expect(status).toContain("registered: false");
  });

  it("treats reaching nothing as a failure", () => {
    const test = code(TAB).split("const sendTest")[1] ?? "";
    expect(test).toContain("(result.sent ?? 0) === 0");
    expect(test).toContain("toast.error");
    // The old message, behind a success tick, is what made this look fine.
    expect(code(TAB)).not.toContain(["Test sent to $", "{result.sent ?? 0} device(s)"].join(""));
  });

  it("says which zero it was, since the two need different fixes", () => {
    const fn = code(FN);
    expect(fn).toContain("No device is registered for notifications on this account");
    expect(fn).toContain("had expired, so it has been removed");
    // A refusal is no longer explained from the status: the status cannot say
    // whether the signature or the device was rejected, so the wording lives
    // with the classifier that reads the provider's own code.
    expect(fn).toContain("describePushFailure(");
    // Whatever shape the response takes, the reason comes back on it. Found
    // from the success return rather than the last one in the file, which is
    // the catch block and carries an error instead.
    const success = fn.slice(fn.indexOf("return json(200, {", fn.indexOf("if (sent === 0)")));
    expect(success.slice(0, 300)).toMatch(/\breason\b/);
  });

  it("explains only a total failure, never a partial send", () => {
    const fn = code(FN);
    expect(fn).toContain("if (sent === 0) {");
    expect(fn.indexOf("let reason: string | undefined;")).toBeGreaterThan(fn.indexOf("const failed = subs.length - sent;"));
  });
});
