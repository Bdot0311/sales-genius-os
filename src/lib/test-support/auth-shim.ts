/**
 * The one `auth.uid()` / `auth.role()` the db-backed tests may install.
 *
 * These functions are global to the database, and the audit job points every
 * db-backed test file at the same one. Four files used to `CREATE OR REPLACE`
 * them with incompatible bodies: runtime-guards installed
 * `auth.uid() = SELECT NULL::uuid` and a constant `auth.role() =
 * 'service_role'`, while outbound-infra, visitor-rls and agent-missions-rls
 * installed versions reading `request.jwt.claim.sub`. Whichever ran last won
 * for everyone, so an RLS test could evaluate its tenant check against another
 * file's definition and see a null uid. That showed up as roughly one run in
 * seven failing on "hides one workspace from another", "isolates workspaces"
 * or "cannot read another tenant" -- tests that pass in isolation, which is
 * what made it look like flake.
 *
 * One body serves all of them, so concurrent redefinition is a no-op rather
 * than a change of behaviour:
 *
 *  - `request.jwt.claim.sub` is what Supabase itself sets, and what the RLS
 *    tests set, so it is read first.
 *  - `app.uid` / `app.role` are what runtime-guards drives its denial case
 *    with, so they are read as a fallback.
 *  - With neither set the result is a null uid and the `service_role` role,
 *    which is exactly what runtime-guards' first block relied on.
 *
 * Every setting is read with `current_setting(..., true)` so a session that
 * never set one gets NULL instead of an error, and both functions are STABLE
 * so a policy can use them.
 */
export const AUTH_SHIM_SQL = `
  CREATE SCHEMA IF NOT EXISTS auth;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $shim$
    SELECT COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      NULLIF(current_setting('app.uid', true), '')
    )::uuid
  $shim$;
  CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $shim$
    SELECT COALESCE(
      NULLIF(current_setting('app.role', true), ''),
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      'service_role'
    )
  $shim$;
`;
