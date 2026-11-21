import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { PG_BOOTSTRAP_SQL } from "./test-support/pg-bootstrap";

/**
 * Whether a stalled visitor resolution is visible.
 *
 * The overview showed a stored page view with Identified 0 and Unknown 0 and
 * nothing to explain it. visitor-resolve calls saveMatch for every job it
 * processes, whatever it decides, so zero matches means nothing ran — not that
 * it ran and found nothing. Those two need telling apart on the page, and
 * visitor_resolve_jobs cannot be read by the browser because it holds ip_raw.
 */
const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";
type Pg = ReturnType<typeof postgres>;

const MIGRATION = readFileSync("supabase/migrations/20261121090000_visitor_resolution_status.sql", "utf8");
const code = (s: string) => s.replace(/^\s*\/\/.*$/gm, "");
const PAGE = code(readFileSync("src/pages/Visitors.tsx", "utf8"));
const INGEST = code(readFileSync("supabase/functions/visitor-ingest/index.ts", "utf8"));
const RESOLVE = code(readFileSync("supabase/functions/visitor-resolve/index.ts", "utf8"));

const MINE = "99999999-9999-9999-9999-999999999999";
const THEIRS = "88888888-8888-8888-8888-888888888888";

const STANDINS = `
${PG_BOOTSTRAP_SQL}
-- No auth.uid() of its own: the shared shim already falls back to app.uid,
-- which is what the as() helper below sets. Defining another one here is
-- drift pg-test-bootstrap.test.ts forbids, and it caught this.
DROP TABLE IF EXISTS visitor_resolve_jobs CASCADE;
CREATE TABLE visitor_resolve_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, status text,
  last_error text, created_at timestamptz DEFAULT now(), finished_at timestamptz);
`;

let dbCounter = 0;
async function withPg(run: (sql: Pg) => Promise<void>) {
  let admin: Pg | null = null;
  try {
    admin = postgres(PG_URL, { max: 1, connect_timeout: 2 });
    await admin`select 1`;
  } catch (err) {
    if (admin) await admin.end({ timeout: 1 });
    if (process.env.AUDIT_PG_REQUIRED === "1") {
      throw new Error(`AUDIT_PG_REQUIRED is set but ${PG_URL} is not reachable: ${err instanceof Error ? err.message : err}`);
    }
    return;
  }
  const name = `vrs_${process.pid}_${Date.now().toString(36)}_${dbCounter++}`;
  let sql: Pg | null = null;
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    sql = postgres(new URL(`/${name}`, PG_URL.replace(/^postgres/, "http")).href.replace(/^http/, "postgres"), {
      max: 2, connect_timeout: 5,
    });
    await sql.unsafe(STANDINS);
    await sql.unsafe(MIGRATION);
    await run(sql);
  } finally {
    if (sql) await sql.end({ timeout: 2 });
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => {});
    await admin.end({ timeout: 2 });
  }
}

const as = (sql: Pg, uid: string) => sql`SELECT set_config('app.uid', ${uid}, false)`;

describe("visitor_resolution_status on postgres", () => {
  it("tells a resolver that never ran apart from one that found nothing", async () => {
    await withPg(async (sql) => {
      await as(sql, MINE);
      await sql`INSERT INTO visitor_resolve_jobs (user_id, status, created_at)
        VALUES (${MINE}, 'queued', now() - interval '2 hours')`;
      const [row] = await sql`SELECT visitor_resolution_status() AS s`;
      const s = row.s as Record<string, unknown>;
      expect(Number(s.queued)).toBe(1);
      expect(Number(s.done)).toBe(0);
      /*
       * The signature of a resolver that is not running at all: work waiting
       * and nothing ever completed. A slow queue would have a timestamp here.
       */
      expect(s.last_finished_at).toBeNull();
      expect(s.oldest_queued_at).not.toBeNull();
    });
  });

  it("reports a resolver that runs and fails, with the reason", async () => {
    await withPg(async (sql) => {
      await as(sql, MINE);
      await sql`INSERT INTO visitor_resolve_jobs (user_id, status, last_error, finished_at)
        VALUES (${MINE}, 'failed', 'RDAP lookup timed out', now())`;
      const [row] = await sql`SELECT visitor_resolution_status() AS s`;
      const s = row.s as Record<string, unknown>;
      expect(Number(s.failed)).toBe(1);
      expect(s.last_error).toBe("RDAP lookup timed out");
    });
  });

  it("counts only the caller's own jobs", async () => {
    await withPg(async (sql) => {
      await sql`INSERT INTO visitor_resolve_jobs (user_id, status) VALUES (${MINE}, 'queued'), (${THEIRS}, 'queued'), (${THEIRS}, 'queued')`;
      await as(sql, MINE);
      expect(Number(((await sql`SELECT visitor_resolution_status() AS s`)[0].s as Record<string, unknown>).queued)).toBe(1);
      await as(sql, THEIRS);
      expect(Number(((await sql`SELECT visitor_resolution_status() AS s`)[0].s as Record<string, unknown>).queued)).toBe(2);
    });
  });

  it("says nothing is waiting once everything has resolved", async () => {
    await withPg(async (sql) => {
      await as(sql, MINE);
      await sql`INSERT INTO visitor_resolve_jobs (user_id, status, finished_at) VALUES (${MINE}, 'done', now())`;
      const s = (await sql`SELECT visitor_resolution_status() AS s`)[0].s as Record<string, unknown>;
      expect(Number(s.queued)).toBe(0);
      expect(Number(s.done)).toBe(1);
      expect(s.last_finished_at).not.toBeNull();
    });
  });

  it("truncates an error rather than returning an unbounded upstream string", async () => {
    await withPg(async (sql) => {
      await as(sql, MINE);
      await sql`INSERT INTO visitor_resolve_jobs (user_id, status, last_error, finished_at)
        VALUES (${MINE}, 'failed', ${"x".repeat(5000)}, now())`;
      const s = (await sql`SELECT visitor_resolution_status() AS s`)[0].s as Record<string, unknown>;
      expect(String(s.last_error).length).toBeLessThanOrEqual(300);
    });
  });
});

describe("the function exposes counts and nothing else", () => {
  it("returns no address, hash or per-row detail", () => {
    // The table it reads holds ip_raw, which is why it is service_role-only.
    for (const leak of ["ip_raw", "ip_hash", "visitor_key", "network_prefix", "site_id"]) {
      expect(MIGRATION, `${leak} must not be returned`).not.toMatch(new RegExp(`'${leak}'`));
    }
  });

  it("is scoped to the caller, not to a user id it is handed", () => {
    expect(MIGRATION).toContain("WHERE user_id = auth.uid()");
    expect(MIGRATION).not.toMatch(/visitor_resolution_status\s*\(\s*p_user_id/);
  });

  it("is not reachable anonymously", () => {
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.visitor_resolution_status() FROM PUBLIC, anon");
    expect(MIGRATION).toContain("TO authenticated, service_role");
  });
});

describe("the overview says which problem it is", () => {
  it("warns when work is waiting", () => {
    expect(PAGE).toContain("waiting to be resolved");
  });

  it("distinguishes never-run from slow, rather than only saying waiting", () => {
    expect(PAGE).toContain("Resolution has never completed");
    expect(PAGE).toContain("last_finished_at");
  });

  it("surfaces a failure and its reason", () => {
    expect(PAGE).toContain("failed to resolve");
    expect(PAGE).toContain("last_error");
  });

  it("does not blank the page when the function is not deployed yet", () => {
    /*
     * It ships in an unpublished migration, so the call errors until the
     * project is published. Folding that into the page's error state would
     * replace a working page with a failure.
     */
    expect(PAGE).toContain("resolutionRes.error ? null :");
    const firstError = PAGE.slice(PAGE.indexOf("const firstError"), PAGE.indexOf("setError("));
    expect(firstError).not.toContain("resolutionRes");
  });
});

describe("what the overview's zeros actually mean", () => {
  it("every processed job writes a match row, so zero matches means none ran", () => {
    /*
     * saveMatch is called unconditionally after the decision, outside the
     * caching branches. If it were ever made conditional, a visit could be
     * processed and still leave the overview reading zero, and the warning
     * above would then be wrong rather than merely absent.
     */
    const body = RESOLVE.slice(RESOLVE.indexOf("async function resolveJob"), RESOLVE.indexOf("async function lookupIdentity"));
    expect(body).toContain("const matchId = await saveMatch(admin, job, decision);");
    const afterDecision = body.slice(body.indexOf("const matchId"));
    expect(afterDecision).not.toMatch(/if\s*\([^)]*\)\s*\{?\s*const matchId/);
  });

  it("a visit from the owner still queues resolution", () => {
    // The enqueue is gated on having an address and an accepted event, not on
    // ownerTest, so testing your own snippet should still produce a row.
    expect(INGEST).toContain("if (plan.ip && accepted > 0) {");
    const enqueue = INGEST.slice(INGEST.indexOf("if (plan.ip && accepted > 0) {"), INGEST.indexOf("if (!ownerTest && accepted > 0)"));
    expect(enqueue).not.toContain("ownerTest");
  });
});
