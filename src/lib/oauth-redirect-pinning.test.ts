import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pinnedRedirectUri, safeRedirectUri } from "../../supabase/functions/_shared/safe-origin";

/* Comments are stripped so an assertion cannot match its own explanation. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fn = (name: string) => code(readFileSync(`supabase/functions/${name}/index.ts`, "utf8"));

const CALENDLY_INIT = fn("calendly-oauth-init");
const CALENDLY_CALLBACK = fn("calendly-oauth-callback");

describe("pinnedRedirectUri", () => {
  it("uses the configured value when its origin is trusted", () => {
    expect(pinnedRedirectUri("https://outreign.lovable.app/integrations", "/integrations"))
      .toBe("https://outreign.lovable.app/integrations");
  });

  it("falls back to the primary domain rather than trusting a foreign origin", () => {
    for (const hostile of [
      "https://evil.example.com/integrations",
      "https://outreign.io.evil.example.com/integrations",
      "http://outreign.io/integrations",
      "not-a-url",
      "/integrations",
      "",
      null,
      undefined,
    ]) {
      expect(pinnedRedirectUri(hostile, "/integrations")).toBe("https://outreign.io/integrations");
    }
  });

  it("returns one stable value, so every host sends the URI Calendly has registered", () => {
    const fromAnywhere = [undefined, "", "https://attacker.test/integrations"]
      .map((v) => pinnedRedirectUri(v, "/integrations"));
    expect(new Set(fromAnywhere).size).toBe(1);
  });
});

describe("Calendly's redirect URI never comes from the browser", () => {
  /*
   * The bug: both functions destructured redirectUri out of the request body
   * and forwarded it to Calendly. Calendly registers one redirect URI and
   * matches it exactly, so any host other than the registered one produced
   * "malformed redirect url" after the user had already signed in to Calendly.
   */
  it("init does not read a redirect URI out of the request body", () => {
    expect(CALENDLY_INIT).not.toMatch(/\{\s*redirectUri\s*[,}]/);
    expect(CALENDLY_INIT).toContain("pinnedRedirectUri(Deno.env.get(\"CALENDLY_REDIRECT_URI\")");
  });

  it("callback does not read a redirect URI out of the request body", () => {
    expect(CALENDLY_CALLBACK).not.toMatch(/redirectUri\s*[,}]\s*=|,\s*redirectUri\s*[,}]/);
    expect(CALENDLY_CALLBACK).toContain("pinnedRedirectUri(Deno.env.get(\"CALENDLY_REDIRECT_URI\")");
  });

  it("derives the same value on both sides, which the token exchange requires", () => {
    const derive = /pinnedRedirectUri\(Deno\.env\.get\("CALENDLY_REDIRECT_URI"\),\s*"\/integrations"\)/;
    expect(CALENDLY_INIT).toMatch(derive);
    expect(CALENDLY_CALLBACK).toMatch(derive);
  });

  it("sends that pinned value as redirect_uri to both Calendly endpoints", () => {
    expect(CALENDLY_INIT).toContain('authUrl.searchParams.set("redirect_uri", redirectUri)');
    expect(CALENDLY_CALLBACK).toContain("redirect_uri: redirectUri");
  });
});

describe("Calendly's documented OAuth endpoints", () => {
  /* https://calendly.com/.well-known/oauth-authorization-server names
     calendly.com for both; auth.calendly.com only 301s to it. */
  it("uses calendly.com, not the redirecting auth. host", () => {
    expect(CALENDLY_INIT).toContain("https://calendly.com/oauth/authorize");
    expect(CALENDLY_CALLBACK).toContain("https://calendly.com/oauth/token");
    for (const src of [CALENDLY_INIT, CALENDLY_CALLBACK]) {
      expect(src).not.toContain("auth.calendly.com");
    }
  });
});

describe("every OAuth init validates its redirect URI", () => {
  /* AGENTS.md: redirect/return URLs go through _shared/safe-origin.ts. */
  for (const name of [
    "calendly-oauth-init",
    "google-oauth-init",
    "slack-oauth-init",
    "hubspot-oauth-init",
    "salesforce-oauth-init",
  ]) {
    it(`${name} does not hand an unchecked origin to the provider`, () => {
      const src = fn(name);
      expect(src).toMatch(/safeRedirectUri|pinnedRedirectUri/);
      expect(src).toContain("_shared/safe-origin.ts");
    });
  }

  it("rejects a foreign origin instead of forwarding it", () => {
    expect(safeRedirectUri("https://evil.example.com/integrations")).toBeNull();
    expect(safeRedirectUri("https://outreign.io/integrations")).toBe("https://outreign.io/integrations");
  });
});

describe("a pinned return still reaches the page that started it", () => {
  it("accepts the popup's message from the primary domain", () => {
    const page = code(readFileSync("src/pages/DashboardIntegrations.tsx", "utf8"));
    const allowed = page.slice(page.indexOf("const OAUTH_MESSAGE_ORIGINS"), page.indexOf("]);", page.indexOf("const OAUTH_MESSAGE_ORIGINS")));
    expect(allowed).toContain("https://outreign.io");
    expect(allowed).toContain("window.location.origin");
    expect(page).toContain("OAUTH_MESSAGE_ORIGINS.has(event.origin)");
  });
});
