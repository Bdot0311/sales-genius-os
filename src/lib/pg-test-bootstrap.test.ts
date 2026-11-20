import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTH_SHIM_SQL } from "./test-support/auth-shim";
import { PG_BOOTSTRAP_SQL, PG_ROLE_BOOTSTRAP_SQL } from "./test-support/pg-bootstrap";

/**
 * The db-backed tests share one database and one role cluster, so their setup
 * has to be shared too. This guards the two ways that went wrong.
 */
const DB_TESTS = readdirSync("src/lib")
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => `src/lib/${f}`)
  .filter((f) => readFileSync(f, "utf8").includes("AUDIT_PG_URL"));

describe("the db-backed tests bootstrap postgres the same way", () => {
  it("finds the files that talk to postgres", () => {
    // If this drops to nothing the rules below pass without checking anything.
    expect(DB_TESTS.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of DB_TESTS) {
    it(`${file.replace("src/lib/", "")} creates no roles of its own`, () => {
      /*
       * anon, authenticated and service_role are cluster-wide. Two files
       * creating them at once raises "tuple concurrently updated", which the
       * IF NOT EXISTS guards cannot prevent: both sessions pass the check and
       * both then write. The shared constant takes an advisory lock so only
       * one does it at a time.
       */
      const src = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
      const inline = [...src.matchAll(/CREATE ROLE (\w+)/g)].map((m) => m[1]);
      expect(inline, `use PG_ROLE_BOOTSTRAP_SQL instead of creating ${inline.join(", ")} here`)
        .toEqual([]);
    });

    it(`${file.replace("src/lib/", "")} defines no auth.uid or auth.role of its own`, () => {
      /*
       * These are one function per database. Files used to install
       * incompatible bodies -- one returning NULL, others reading
       * request.jwt.claim.sub -- and whichever ran last decided what every
       * other file's RLS test saw.
       */
      const src = readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "");
      expect(src).not.toMatch(/CREATE OR REPLACE FUNCTION auth\.(uid|role)/);
    });
  }
});

describe("the shared bootstrap", () => {
  it("takes the lock in the same batch as the role DDL", () => {
    /*
     * postgres runs a multi-statement simple query as one implicit
     * transaction, so an xact-scoped lock covers the statements after it in
     * the same batch. Split into its own round trip it would be released
     * before the DDL ran and protect nothing.
     */
    const lockAt = PG_ROLE_BOOTSTRAP_SQL.indexOf("pg_advisory_xact_lock");
    const ddlAt = PG_ROLE_BOOTSTRAP_SQL.indexOf("CREATE ROLE");
    expect(lockAt).toBeGreaterThanOrEqual(0);
    expect(ddlAt).toBeGreaterThan(lockAt);
  });

  it("carries the auth shim alongside the roles", () => {
    expect(PG_BOOTSTRAP_SQL).toContain("pg_advisory_xact_lock");
    expect(PG_BOOTSTRAP_SQL).toContain(AUTH_SHIM_SQL.trim().split("\n")[0].trim());
  });

  it("reads the claim Supabase sets, then the one runtime-guards drives", () => {
    // Both callers have to work from one body, or redefinition changes meaning.
    expect(AUTH_SHIM_SQL).toContain("request.jwt.claim.sub");
    expect(AUTH_SHIM_SQL).toContain("app.uid");
    expect(AUTH_SHIM_SQL).toContain("app.role");
    // With neither set: a null uid and the service_role role.
    expect(AUTH_SHIM_SQL).toContain("'service_role'");
  });

  it("reads every setting without erroring when it was never set", () => {
    const missingDefault = [...AUTH_SHIM_SQL.matchAll(/current_setting\(([^)]*)\)/g)]
      .map((m) => m[1])
      .filter((args) => !/,\s*true\s*$/.test(args));
    expect(missingDefault, "current_setting needs its missing_ok argument").toEqual([]);
  });
});
