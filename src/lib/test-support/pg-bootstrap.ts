/**
 * Creating the Supabase roles, serialized across test files.
 *
 * `anon`, `authenticated` and `service_role` are cluster-wide, not per
 * database, so every db-backed test file that needs them creates the same
 * three. Four of them did that concurrently under vitest's parallel runner,
 * and concurrent DDL against the same `pg_authid` rows raises
 * "tuple concurrently updated" -- postgres refusing a catalog write that
 * another transaction is already making.
 *
 * That surfaced as about one run in ten failing on
 * "revokes anon and authenticated, grants service_role", a test that passes in
 * isolation every time, which is what made it look like flake rather than a
 * race. The `IF NOT EXISTS` guards do not help: two sessions can both pass the
 * check and then both try to write.
 *
 * The advisory lock makes the bootstrap one-at-a-time. It is taken in the same
 * statement batch as the DDL on purpose: postgres runs a multi-statement
 * simple query as one implicit transaction, so an xact-scoped lock covers the
 * role creation and is released when the batch ends. Splitting the lock into
 * its own call would release it immediately and protect nothing.
 *
 * The key is arbitrary but must be shared, which is the reason this lives in
 * one module rather than being pasted per file.
 */
import { AUTH_SHIM_SQL } from "./auth-shim";

const ROLE_BOOTSTRAP_LOCK = 728_193_044;

export const PG_ROLE_BOOTSTRAP_SQL = `
  SELECT pg_advisory_xact_lock(${ROLE_BOOTSTRAP_LOCK});
  DO $boot$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $boot$;
`;

/** The roles plus the shared auth.uid()/auth.role() shim, which every RLS test needs. */
export const PG_BOOTSTRAP_SQL = `${PG_ROLE_BOOTSTRAP_SQL}\n${AUTH_SHIM_SQL}`;
