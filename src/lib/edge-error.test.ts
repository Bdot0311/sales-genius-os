import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { edgeErrorCode, edgeErrorMessage } from "./edge-error";

/** Source with comments stripped, so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const INIT = code(readFileSync("supabase/functions/google-oauth-init/index.ts", "utf8"));
const PAGE = code(readFileSync("src/pages/DashboardIntegrations.tsx", "utf8"));

/**
 * "Edge Function returned a non-2xx status code."
 *
 * That sentence is what connecting a Gmail mailbox showed for days, and it is
 * the same sentence for a missing server secret, an expired session and a
 * malformed request. `supabase.functions.invoke` reports every non-2xx that
 * way and leaves the function's own response — the one carrying the reason —
 * on `error.context`, unread. `if (error) throw error` then shows the user the
 * only message that cannot distinguish anything.
 *
 * 59 files in this project call `functions.invoke`, so this was not one
 * screen's problem.
 */

/** A FunctionsHttpError as supabase-js builds it: generic message, real body on context. */
function invokeError(status: number, body: unknown): Error & { context: Response } {
  const err = new Error("Edge Function returned a non-2xx status code") as Error & { context: Response };
  err.context = new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  return err;
}

describe("the message the function actually sent", () => {
  it("is read out of the response, not the transport", async () => {
    const err = invokeError(503, {
      error: "Google isn't configured on our side: GOOGLE_CLIENT_ID is not set.",
      error_code: "google_client_id_missing",
    });
    await expect(edgeErrorMessage(err, "fallback")).resolves.toContain("GOOGLE_CLIENT_ID is not set");
    await expect(edgeErrorCode(err)).resolves.toBe("google_client_id_missing");
  });

  it("never returns the transport sentence, which is what users already saw", async () => {
    const err = invokeError(500, {});
    const msg = await edgeErrorMessage(err, "Failed to start the connection");
    expect(msg).toBe("Failed to start the connection");
    expect(msg).not.toMatch(/non-2xx/i);
  });

  it("leaves the body readable for the caller", async () => {
    /*
     * A Response body can be read once. Consuming it here would break any
     * caller that then wants the status or the code, so this works on a clone
     * — and reading twice must keep working.
     */
    const err = invokeError(401, { error: "Your session has expired." });
    await expect(edgeErrorMessage(err, "fallback")).resolves.toBe("Your session has expired.");
    await expect(edgeErrorCode(err)).resolves.toBeNull();
    await expect(err.context.json()).resolves.toMatchObject({ error: "Your session has expired." });
  });

  it("a plain network failure still says something real", async () => {
    // No context at all: this is a genuine fetch failure, and its message is
    // the useful one.
    await expect(edgeErrorMessage(new Error("Failed to fetch"), "fallback")).resolves.toBe("Failed to fetch");
  });

  it("a non-JSON body is surfaced, but an HTML error page is not", async () => {
    const text = new Error("Edge Function returned a non-2xx status code") as Error & { context: Response };
    text.context = new Response("upstream timed out", { status: 504 });
    await expect(edgeErrorMessage(text, "fallback")).resolves.toBe("upstream timed out");

    const html = new Error("Edge Function returned a non-2xx status code") as Error & { context: Response };
    html.context = new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 });
    await expect(edgeErrorMessage(html, "fallback"), "a gateway page is not an explanation").resolves.toBe("fallback");
  });

  it("an empty or whitespace message does not win over the fallback", async () => {
    await expect(edgeErrorMessage(invokeError(500, { error: "   " }), "fallback")).resolves.toBe("fallback");
  });
});

describe("the Google connection says which problem it is", () => {
  it("a missing secret is ours, is not retryable, and says so", () => {
    expect(INIT).toContain("google_client_id_missing");
    expect(INIT).toContain("google_client_secret_missing");
    expect(INIT).toMatch(/Retrying won't help/);
  });

  it("the secret is checked up front, not after the consent screen", () => {
    /*
     * Only the callback spends GOOGLE_CLIENT_SECRET. Letting the user walk
     * through all of Google's consent and fail at the end makes a missing
     * credential of ours read as Google rejecting them.
     */
    // The guard, not the mention: `Deno.env.get("GOOGLE_CLIENT_SECRET")` sits
    // above the URL either way, so keying on the name passes with the check
    // disabled — which is exactly what a mutation showed.
    const guard = INIT.indexOf("if (!GOOGLE_CLIENT_SECRET)");
    const buildUrl = INIT.indexOf("accounts.google.com/o/oauth2/v2/auth");
    expect(guard, "the early return must exist").toBeGreaterThan(-1);
    expect(guard).toBeLessThan(buildUrl);
  });

  it("an expired session is the user's and is distinguishable", () => {
    expect(INIT).toContain("session_expired");
    expect(INIT).toMatch(/401/);
  });

  it("no failure path returns the old catch-all sentence", () => {
    expect(INIT).not.toContain("Could not start Google sign-in. Please try again.");
  });

  it("the page shows the function's message rather than the transport's", () => {
    expect(PAGE).toContain("edgeErrorMessage(");
    // The old form, which threw the transport error straight into the toast.
    expect(PAGE).not.toContain("description: error.message || `Failed to start");
  });
});

describe("the secrets probe reports presence without leaking a value", () => {
  const PROBE = code(readFileSync("supabase/functions/integration-secrets-probe/index.ts", "utf8"));

  it("reports the two that broke sending", () => {
    expect(PROBE).toContain("GOOGLE_CLIENT_ID");
    expect(PROBE).toContain("GOOGLE_CLIENT_SECRET");
  });

  it("never returns the secret itself", () => {
    /*
     * The whole point is to be safe to open on a screen. Returning `value`
     * anywhere would put a credential in a browser, a log and a screenshot.
     */
    expect(PROBE).not.toMatch(/\bvalue,|\bvalue\s*:\s*value\b/);
    expect(PROBE).toContain("fingerprint");
    expect(PROBE).toMatch(/slice\(0, 4\)/);
  });

  it("flags a value that was pasted with quotes or spaces", () => {
    // Set-but-wrong is the case rotating a credential cannot distinguish.
    expect(PROBE).toContain("suspicious");
    expect(PROBE).toMatch(/trim\(\)\.length !== value\.length/);
  });

  it("is gated, but not behind the service role", () => {
    // Same reasoning as the SMTP probe: a key nobody can get is why that one
    // went unrun for twelve days. It contains no secret, so any signed-in
    // user may ask.
    expect(PROBE).toContain("requireInternalOrUser");
  });
});
