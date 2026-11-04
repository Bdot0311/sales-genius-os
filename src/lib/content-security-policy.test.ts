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
 * Identity Services needs all three: the script itself, the iframe the
 * rendered button lives in, and the calls it makes to mint the ID token.
 * Allowing the script alone gets a button that cannot do anything.
 */
const GIS_DIRECTIVES = ["script-src", "frame-src", "connect-src"] as const;

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
