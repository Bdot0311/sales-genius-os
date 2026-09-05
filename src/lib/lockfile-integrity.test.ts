import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));

/**
 * `npm ci` was broken for anyone doing a clean install of this repo:
 *
 *   npm error Missing: @lovable.dev/email-js@0.1.0 from lock file
 *   npm error Missing: @lovable.dev/webhooks-js@0.0.1 from lock file
 *
 * package.json declared the first and the committed lockfile carried neither.
 * Nothing caught it because the only CI jobs at the time ran node scripts with
 * no dependencies — the first job that actually installed anything found it
 * immediately.
 *
 * This asserts the property rather than the two names: every dependency the
 * manifest declares has to exist in the lockfile, so the next one to drift
 * fails here instead of in someone's clean checkout.
 */
describe("the lockfile can satisfy the manifest", () => {
  const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  it("has dependencies to check, so this cannot pass vacuously", () => {
    expect(Object.keys(declared).length).toBeGreaterThan(50);
  });

  it("carries an entry for every declared dependency", () => {
    const missing = Object.keys(declared).filter((name) => !lock.packages?.[`node_modules/${name}`]);
    expect(missing).toEqual([]);
  });

  it("carries the two that were missing", () => {
    expect(lock.packages?.["node_modules/@lovable.dev/email-js"]?.version).toBe("0.1.0");
    expect(lock.packages?.["node_modules/@lovable.dev/webhooks-js"]?.version).toBe("0.0.1");
  });

  it("records the manifest's own dependency list in the root entry", () => {
    // npm ci compares this against package.json before it installs anything;
    // a missing name here is the exact error it refuses on.
    expect(lock.packages?.[""]?.dependencies?.["@lovable.dev/email-js"]).toBe("0.1.0");
  });

  it("resolves them from the public registry, not a private one", () => {
    // A private-registry resolution would make a clean install depend on
    // credentials that CI and new contributors do not have.
    for (const name of ["@lovable.dev/email-js", "@lovable.dev/webhooks-js"]) {
      expect(lock.packages?.[`node_modules/${name}`]?.resolved).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    }
  });
});
