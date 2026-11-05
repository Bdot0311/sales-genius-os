import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "../../supabase/functions/_shared/turnstile.ts";

const ok = (body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("verifyTurnstile", () => {
  /*
   * Fail open with no secret. A missing key is an operator mistake, and
   * closing would lock every real person out of the form while nobody
   * notices — worse than the spam it would stop.
   */
  it("allows the submission when no secret is configured", async () => {
    const r = await verifyTurnstile("anything", null, undefined, ok({ success: false }));
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("no_secret");
  });

  it("refuses a submission with no token once a secret is set", async () => {
    for (const token of [undefined, null, "", 42]) {
      const r = await verifyTurnstile(token, null, "secret", ok({ success: true }));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("missing_token");
    }
  });

  it("allows a token Cloudflare accepts", async () => {
    const r = await verifyTurnstile("t", "1.2.3.4", "secret", ok({ success: true }));
    expect(r).toEqual({ ok: true, reason: "verified" });
  });

  it("refuses a token Cloudflare rejects", async () => {
    const r = await verifyTurnstile("t", null, "secret", ok({ success: false }));
    expect(r).toEqual({ ok: false, reason: "rejected" });
  });

  it("sends the secret, the token and the caller's ip", async () => {
    let sent: FormData | null = null;
    await verifyTurnstile("tok", "9.9.9.9", "sec", (async (_u: any, init: any) => {
      sent = init.body as FormData;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(sent!.get("secret")).toBe("sec");
    expect(sent!.get("response")).toBe("tok");
    expect(sent!.get("remoteip")).toBe("9.9.9.9");
  });

  /*
   * An outage at the verifier must not take the form down with it, for the
   * same reason a missing secret does not.
   */
  it("allows the submission when Cloudflare cannot be reached", async () => {
    const r = await verifyTurnstile("t", null, "secret", (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, reason: "unreachable" });
  });

  it("refuses rather than throwing when the answer is not JSON", async () => {
    const r = await verifyTurnstile("t", null, "secret", (async () =>
      new Response("<html>", { status: 200 })) as unknown as typeof fetch);
    expect(r.ok).toBe(false);
  });
});
