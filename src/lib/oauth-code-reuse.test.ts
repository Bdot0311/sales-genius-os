import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * An OAuth authorization code is single-use.
 *
 * The second exchange of one comes back `invalid_grant`, and the user is told
 * the connection failed — when what actually happened is that it was already
 * spent. "Failed auth code" is what that looks like from the outside.
 *
 * There was a guard, and it could not cover the call it existed for. It lived
 * in `handleOAuthCallback` and keyed off `sessionStorage`, which is per
 * WINDOW. The popup flow goes:
 *
 *   popup lands on /integrations?code=…
 *     -> marks the code used in the POPUP's sessionStorage
 *     -> postMessage(code) to the opener
 *     -> popup closes
 *   opener receives the message
 *     -> completeOAuthConnection(code)      <- never saw the mark
 *
 * The window that marked the code and the window that spent it were different
 * windows, so the mark protected nothing on the path that matters.
 *
 * Source-asserted: this lives in a page component wired to Supabase auth, a
 * toast provider and a router, and standing all of that up would test the
 * harness rather than the guard. What the guard has to be is small and exact,
 * so it is pinned exactly.
 */

const PAGE = "src/pages/DashboardIntegrations.tsx";
const code = readFileSync(PAGE, "utf8");

describe("one exchange per authorization code", () => {
  it("the guard sits in the function that performs the exchange", () => {
    /*
     * Both entry points — the URL path and the popup handoff — call
     * `completeOAuthConnection`, so guarding there covers both. Guarding
     * either caller covers only that caller.
     */
    const fnStart = code.indexOf("const completeOAuthConnection = async");
    expect(fnStart, "completeOAuthConnection should exist").toBeGreaterThan(-1);
    const fnEnd = code.indexOf("\n  };", fnStart);
    const body = code.slice(fnStart, fnEnd);

    expect(body).toContain("exchangedCodes.has(code)");
    expect(body).toContain("exchangedCodes.add(code)");

    // Before the call to the callback, or it guards nothing.
    const guardAt = body.indexOf("exchangedCodes.add(code)");
    const invokeAt = body.indexOf("supabase.functions.invoke(");
    expect(invokeAt).toBeGreaterThan(-1);
    expect(guardAt, "the mark must be set before the exchange").toBeLessThan(invokeAt);
  });

  it("the marker is module scope, not per-window storage", () => {
    /*
     * The whole defect: `sessionStorage` is per window, and the popup's is
     * not its opener's. A module-level set lives in the window that actually
     * calls the callback.
     */
    const declAt = code.indexOf("const exchangedCodes = new Set<string>()");
    expect(declAt, "the set should exist").toBeGreaterThan(-1);
    // Outside the component, or every mount gets a fresh empty one.
    const componentAt = code.search(/^const DashboardIntegrations|^export default function/m);
    if (componentAt > -1) expect(declAt).toBeLessThan(componentAt);
  });

  it("the per-window marker is kept, but is no longer the only guard", () => {
    /*
     * sessionStorage still earns its place: it survives a reload of the same
     * window, which an in-memory set does not. It is a second line now rather
     * than the only one.
     */
    expect(code).toContain("oauth-code-used:");
    const seen = [...code.matchAll(/exchangedCodes/g)].length;
    expect(seen, "the in-memory guard should be read and written").toBeGreaterThanOrEqual(3);
  });

  it("both entry points go through the guarded function", () => {
    /*
     * Exactly two call sites: the URL path (`handleOAuthCallback`) and the
     * popup handoff (`handleOAuthMessage`). The declaration reads
     * `= async (`, so it is not one of these matches — counted separately.
     */
    const calls = [...code.matchAll(/completeOAuthConnection\(/g)].length;
    expect(calls, "the URL path and the popup handoff").toBe(2);
    expect(code).toContain("const completeOAuthConnection = async");
    // A third caller added later would have to be guarded too, and would
    // fail this until someone looks at why.
    expect(code).toContain("OAUTH_MESSAGE_TYPE");
  });
});
