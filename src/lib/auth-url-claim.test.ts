import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * "failed to exchange authorization code", on every Google sign-in.
 *
 * Two auth clients were racing for the same query parameter. supabase-js
 * defaults detectSessionInUrl to true with flowType "pkce", so on each page
 * load it scanned the address bar for `?code=` and tried to exchange it.
 * Google's OAuth return lands on /auth carrying exactly that — but the code
 * belongs to Lovable's client, which started the flow and holds the only
 * matching verifier. Supabase's exchange failed, and an authorization code is
 * single use, so the real exchange a moment later found it already spent.
 *
 * It appeared when the OAuth redirect moved from "/" to "/auth" on 28 Sept.
 * The homepage defers loading the Supabase client, so nothing was there to
 * take the code first. /auth loads it eagerly.
 */
const CLIENT = readFileSync("src/integrations/supabase/client.ts", "utf8");
const AUTH_PAGE = readFileSync("src/pages/Auth.tsx", "utf8");
const bare = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("the Supabase client does not read the URL", () => {
  it("turns off the scan that ate the code", () => {
    expect(bare(CLIENT)).toContain("detectSessionInUrl: false,");
  });

  /*
   * client.ts is generated, and says so at the top. If Lovable rewrites it the
   * flag goes with it and Google sign-in breaks again — silently, because
   * nothing else in the app would notice. This is the thing that notices.
   */
  it("still carries the generated-file warning, so a rewrite is expected", () => {
    expect(CLIENT).toContain("automatically generated");
  });
});

describe("Supabase's own links are claimed by the page instead", () => {
  const page = bare(AUTH_PAGE);

  it("handles a hash link by setting the session from its tokens", () => {
    // Read from either half of the URL: Supabase's own links use the hash,
    // and nothing published about Lovable's broker says which it redirects
    // back with. Missing them after the broker succeeded is the one failure
    // nothing here would report.
    expect(page).toContain('hashParams.get("access_token") ?? queryParams.get("access_token")');
    expect(page).toContain('hashParams.get("refresh_token") ?? queryParams.get("refresh_token")');
    expect(page).toContain("await supabase.auth.setSession({");
  });

  it("handles a code link by exchanging it", () => {
    expect(page).toContain("await supabase.auth.exchangeCodeForSession(code as string)");
  });

  /*
   * The whole fix rests on this one condition. A code with no `type` is
   * Lovable's and must be left alone; taking it is the original bug.
   */
  it("only touches a code when the URL also carries a type", () => {
    expect(page).toContain("const codeLink = !!(code && linkType);");
    expect(page).toContain("if (!hashLink && !codeLink) return;");
  });

  it("reads type from the hash as well as the query", () => {
    // Recovery redirects commonly put it after the '#'.
    expect(page).toContain('queryParams.get("type") ?? hashParams.get("type")');
  });

  it("consumes the link once", () => {
    expect(page).toContain("if (linkHandled.current) return;");
    expect(page).toContain("linkHandled.current = true;");
  });

  it("says so when a reset link cannot be completed", () => {
    // Opening it in a different browser from the one that requested it leaves
    // no verifier, and an idle spinner is a worse answer than a sentence.
    expect(page).toContain("setCheckingRecovery(false);");
    expect(page).toContain("Request a new one and open it in this browser.");
  });

  it("clears the tokens out of the address bar, as the old scan did", () => {
    expect(page).toContain("window.history.replaceState({}, \"\", `${window.location.pathname}${window.location.search}`)");
  });
});

describe("password reset still reaches the reset form", () => {
  const page = bare(AUTH_PAGE);

  it("recovery is still detected from either place", () => {
    expect(page).toContain('const isRecoveryFlow = recoveryType === "recovery";');
  });

  it("and the session this page now establishes is what opens it", () => {
    // setSession / exchangeCodeForSession both emit through onAuthStateChange,
    // which is the path that was already showing the form.
    expect(page).toContain('event === "PASSWORD_RECOVERY" || event === "SIGNED_IN"');
    expect(page).toContain("setShowPasswordReset(true);");
  });

  it("does not redirect a recovery session to the dashboard", () => {
    const handler = page.slice(page.indexOf("onAuthStateChange"));
    const recoveryGuard = handler.indexOf("if (isRecoveryFlow) {");
    const dashboard = handler.indexOf('navigate(target ?? "/dashboard")');
    expect(recoveryGuard).toBeGreaterThan(-1);
    expect(recoveryGuard).toBeLessThan(dashboard);
  });
});

describe("the sign-in that broke", () => {
  it("still returns to /auth, which was the right call", () => {
    /*
     * Reverting this would reintroduce the bug it fixed: the homepage drops
     * the session because it loads the auth client too late.
     *
     * The option is `redirectTo` now, not `redirect_uri` — sign-in moved off
     * Lovable's broker, whose exchange had been failing, onto Supabase's own
     * Google provider. What must not change is the destination.
     */
    const form = readFileSync("src/components/auth/AuthForm.tsx", "utf8");
    expect(form).toContain("redirectTo: `${window.location.origin}/auth`");
    expect(form, "the broker is what was failing").not.toContain("lovable.auth.signInWithOAuth");
  });

  it("and Lovable's wrapper is still what hands tokens to Supabase", () => {
    const wrapper = readFileSync("src/integrations/lovable/index.ts", "utf8");
    expect(bare(wrapper)).toContain("await supabase.auth.setSession(result.tokens);");
  });
});
