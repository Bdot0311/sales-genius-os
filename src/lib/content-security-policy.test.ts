import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The policy has to allow what the code actually loads.
 *
 * Google sign-in was rewritten to use Identity Services, the tests passed,
 * the build passed, and on the deploy preview the browser said:
 *
 *   Refused to load the script 'https://accounts.google.com/gsi/client'
 *   because it violates the following Content-Security-Policy directive
 *
 * The feature was not broken. It was inert. Every fallback worked exactly as
 * designed and quietly served the old button, so nothing failed loudly enough
 * to be noticed — the failure mode of a careful fallback is silence.
 *
 * Nothing guarded this, because the policy lives in two files that no test
 * read, and both have to allow an origin for the browser to permit it: the
 * HTTP header Netlify serves and the <meta> tag in the document. A browser
 * enforces both, so the effective policy is their intersection and adding an
 * origin to one of them achieves nothing.
 */

const HEADERS = readFileSync("public/_headers", "utf8");
const INDEX = readFileSync("index.html", "utf8");

/** The script URL the loader actually requests, read from its source. */
const loaderSource = readFileSync("src/lib/google-identity.ts", "utf8");
const scriptUrlMatch = loaderSource.match(/GIS_SCRIPT_SRC\s*=\s*["'`]([^"'`]+)["'`]/);
const gisOrigin = scriptUrlMatch ? new URL(scriptUrlMatch[1]).origin : "";

/** Same, for Calendly's embed bundle. */
const calendlySource = readFileSync("src/lib/calendly-embed.ts", "utf8");
const calendlyMatch = calendlySource.match(/CALENDLY_SCRIPT_SRC\s*=\s*["'`]([^"'`]+)["'`]/);
const calendlyOrigin = calendlyMatch ? new URL(calendlyMatch[1]).origin : "";

/** Pull one directive's source list out of a policy string. */
function directive(policy: string, name: string): string[] {
  const match = policy.match(new RegExp(`(?:^|;)\\s*${name}\\s+([^;"]+)`));
  return match ? match[1].trim().split(/\s+/) : [];
}

const headerPolicy = (HEADERS.match(/Content-Security-Policy:\s*(.+)/) ?? ["", ""])[1];
const metaPolicy = (INDEX.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/) ?? ["", ""])[1];

const POLICIES: Array<[string, string]> = [
  ["public/_headers", headerPolicy],
  ["index.html", metaPolicy],
];

/*
 * Identity Services needs all four, and the list is this long because each
 * one was found the hard way by reloading the deploy preview:
 *
 *   script-src   the loader itself
 *   style-src    accounts.google.com/gsi/style, which the button is drawn with
 *   frame-src    the iframe the rendered button lives in
 *   connect-src  the calls that mint the ID token
 *
 * Allowing the script alone gets a button that cannot do anything, and
 * allowing everything but the stylesheet gets one that is unstyled — which is
 * worse than absent, because it looks like a shipped bug rather than a
 * fallback.
 */
const GIS_DIRECTIVES = ["script-src", "style-src", "frame-src", "connect-src"] as const;

/** Every directive in a policy, as name -> source list. */
function parseAll(policy: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of policy.split(";")) {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (bits.length) out[bits[0]] = bits.slice(1);
  }
  return out;
}

/*
 * A policy delivered in a <meta> tag has three directives silently ignored by
 * every browser, so those are the only ones allowed to live in the header
 * alone. Everything else must match, or the stricter file wins and the
 * difference shows up as a feature that works in development and not in
 * production.
 */
const META_IGNORES = new Set(["frame-ancestors", "report-uri", "sandbox"]);

/*
 * The booking widget needs its bundle and its stylesheet. frame-src already
 * allows calendly.com for the booking iframe itself, which is a different
 * origin from the one the bundle is served off.
 */
describe("the content security policy allows the booking widget", () => {
  it("knows which origin the Calendly loader asks for", () => {
    expect(calendlyOrigin).toBe("https://assets.calendly.com");
  });

  for (const [file, policy] of POLICIES) {
    for (const name of ["script-src", "style-src"] as const) {
      it(`${file} allows it in ${name}`, () => {
        expect(
          directive(policy, name),
          `${file} blocks ${calendlyOrigin} in ${name}, so the booking step renders nothing`,
        ).toContain(calendlyOrigin);
      });
    }
  }

  it("still allows the booking iframe itself", () => {
    for (const [file, policy] of POLICIES) {
      expect(directive(policy, "frame-src"), `${file} frame-src`).toContain("https://calendly.com");
    }
  });
});

describe("the two policy files say the same thing", () => {
  const header = parseAll(headerPolicy);
  const meta = parseAll(metaPolicy);

  it("found enough directives to be comparing something", () => {
    expect(Object.keys(header).length).toBeGreaterThan(6);
    expect(Object.keys(meta).length).toBeGreaterThan(6);
  });

  for (const name of [...new Set([...Object.keys(header), ...Object.keys(meta)])].sort()) {
    if (META_IGNORES.has(name)) continue;
    it(`${name}`, () => {
      expect(
        [...(header[name] ?? [])].sort(),
        `public/_headers and index.html disagree about ${name}; a browser enforces both, so the stricter one wins silently`,
      ).toEqual([...(meta[name] ?? [])].sort());
    });
  }

  it("keeps frame-ancestors on the header, where it is not ignored", () => {
    expect(header["frame-ancestors"]).toEqual(["'none'"]);
    expect(meta["frame-ancestors"]).toBeUndefined();
  });
});

/*
 * Origins that were in the policy and in nothing else. Each one was checked
 * against the codebase before removal: cdn.gpteng.co had no loader at all,
 * the focusapps host had only a dns-prefetch hint, and the "railway" in
 * enrichment-source.ts is a source label rendered in the UI, never a URL the
 * browser opens. Listed here so they are not pasted back in by reflex.
 */
describe("dead origins stay out of the policy", () => {
  for (const origin of [
    "cdn.gpteng.co",
    "r2.direasy-multi-tenant.focusapps.app",
    "up.railway.app",
  ]) {
    it(`${origin}`, () => {
      expect(headerPolicy, `${origin} is back in public/_headers`).not.toContain(origin);
      expect(metaPolicy, `${origin} is back in index.html`).not.toContain(origin);
      expect(INDEX, `${origin} is back in index.html outside the policy`).not.toContain(origin);
    });
  }
});

describe("the content security policy", () => {
  it("was found in both places, and they are real policies", () => {
    // A guard on the guard. A rename or a reformat that broke either regex
    // would otherwise let every assertion below pass against an empty string.
    expect(headerPolicy, "no policy parsed out of public/_headers").toContain("default-src");
    expect(metaPolicy, "no policy parsed out of index.html").toContain("default-src");
    expect(directive(headerPolicy, "script-src").length).toBeGreaterThan(3);
    expect(directive(metaPolicy, "frame-src").length).toBeGreaterThan(0);
  });

  it("knows which origin the Google loader asks for", () => {
    expect(gisOrigin, "GIS_SCRIPT_SRC could not be read from the loader").toBe(
      "https://accounts.google.com",
    );
  });

  for (const [file, policy] of POLICIES) {
    for (const name of GIS_DIRECTIVES) {
      it(`${file} allows the Google sign-in origin in ${name}`, () => {
        expect(
          directive(policy, name),
          `${file} blocks ${gisOrigin} in ${name}, which makes Google sign-in silently fall back`,
        ).toContain(gisOrigin);
      });
    }
  }

  /*
   * The two files drift. They already list different origins for analytics
   * and embeds, which is survivable; disagreeing about a directive sign-in
   * depends on is not, because the stricter of the two wins and the symptom
   * is a feature that does nothing on production and works everywhere else.
   */
  it("does not let the two files disagree about what sign-in needs", () => {
    for (const name of GIS_DIRECTIVES) {
      const inHeader = directive(headerPolicy, name).includes(gisOrigin);
      const inMeta = directive(metaPolicy, name).includes(gisOrigin);
      expect(inHeader, `${name}: _headers and index.html disagree`).toBe(inMeta);
    }
  });
});
