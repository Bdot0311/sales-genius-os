import { PG_BOOTSTRAP_SQL } from "./test-support/pg-bootstrap";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";

describe("visitor intelligence tenant isolation", () => {
  it("hides one workspace from another, blocks raw event writes, and keeps the flag off", async (ctx) => {
    if (!PG_URL.includes("127.0.0.1") && !PG_URL.includes("localhost")) {
      throw new Error("refusing to create test roles outside local postgres");
    }
    let sql: ReturnType<typeof postgres> | null = null;
    try {
      sql = postgres(PG_URL, { max: 1, connect_timeout: 2 });
      await sql`select 1`;
    } catch (err) {
      if (sql) await sql.end({ timeout: 1 });
      if (process.env.AUDIT_PG_REQUIRED === "1") throw err;
      ctx.skip();
      return;
    }

    try {
      const bootstrap = `
        ${PG_BOOTSTRAP_SQL}
        DO $$ BEGIN
          CREATE TYPE public.app_role AS ENUM ('admin', 'user');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
        RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
        CREATE TABLE IF NOT EXISTS public.feature_flags (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text UNIQUE NOT NULL,
          description text,
          is_enabled boolean NOT NULL DEFAULT false,
          target_plans text[] DEFAULT ARRAY['growth','pro']
        );`;
      const [me] = await sql`SELECT current_user AS name, rolsuper FROM pg_roles WHERE rolname = current_user`;
      if (me.rolsuper) await sql.unsafe(bootstrap);
      else {
        const dbName = new URL(PG_URL).pathname.replace(/^\//, "") || "audit_test";
        const member = String(me.name).replace(/"/g, "");
        execFileSync("sudo", ["-u", "postgres", "psql", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-c",
          `${bootstrap}\nGRANT anon, authenticated, service_role TO "${member}";`], { stdio: "pipe" });
      }
      await sql.unsafe(readFileSync("supabase/migrations/20261115180000_visitor_intelligence.sql", "utf8"));
      await sql.unsafe(readFileSync("supabase/migrations/20261115203000_visitor_rule_tenant_and_reclaim.sql", "utf8"));
      await sql.unsafe(readFileSync("supabase/migrations/20261115220000_claim_visitor_rule_run.sql", "utf8"));

      const owner = crypto.randomUUID();
      const other = crypto.randomUUID();
      const site = crypto.randomUUID();
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE service_role`;
        await tx`INSERT INTO public.visitor_sites (id, user_id, name, allowed_domains)
          VALUES (${site}::uuid, ${owner}::uuid, 'Acme', ARRAY['acme.test'])`;
        await tx`INSERT INTO public.visitor_events (site_id, user_id, event_id, event_name, session_id, visitor_key, path)
          VALUES (${site}::uuid, ${owner}::uuid, '33333333-3333-4333-8333-333333333333', 'page_view', 'sess', 'visitor', '/pricing')`;
      });

      const hiddenFlag = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT public.visitor_intelligence_enabled() AS on`;
      });
      expect(hiddenFlag[0].on).toBe(false);

      const beforeGrant = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT id FROM public.visitor_sites`;
      });
      expect(beforeGrant).toEqual([]);

      await sql`UPDATE public.feature_flags SET is_enabled = true WHERE name = 'visitorIntelligence'`;
      await sql`INSERT INTO public.visitor_workspace_grants (user_id, enabled) VALUES (${owner}::uuid, true)`;

      const seen = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT name FROM public.visitor_sites`;
      });
      expect(seen.map((row) => row.name)).toEqual(["Acme"]);

      const otherSees = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${other}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT id FROM public.visitor_events`;
      });
      expect(otherSees).toEqual([]);

      const otherFlag = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${other}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT public.visitor_intelligence_enabled() AS on`;
      });
      expect(otherFlag[0].on).toBe(false);

      await expect(sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`INSERT INTO public.visitor_events (site_id, user_id, event_id, event_name, session_id, visitor_key)
          VALUES (${site}::uuid, ${owner}::uuid, '44444444-4444-4444-8444-444444444444', 'page_view', 'sess', 'visitor')`;
      })).rejects.toThrow(/permission denied/i);

      await expect(sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${other}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`INSERT INTO public.visitor_workspace_grants (user_id, enabled) VALUES (${other}::uuid, true)`;
      })).rejects.toThrow(/row-level security/i);

      await expect(sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE anon`;
        await tx`SELECT id FROM public.visitor_sites`;
      })).rejects.toThrow(/permission denied/i);

      await expect(sql`INSERT INTO public.visitor_company_matches (site_id, user_id, visitor_key, status, company_name)
        VALUES (${site}::uuid, ${owner}::uuid, 'visitor', 'matched', 'Invented')`).rejects.toThrow(/check/i);

      await expect(sql`INSERT INTO public.visitor_events (site_id, user_id, event_id, event_name, session_id, visitor_key)
        VALUES (${site}::uuid, ${owner}::uuid, '33333333-3333-4333-8333-333333333333', 'page_view', 'sess', 'visitor')`).rejects.toThrow(/duplicate/i);

      await sql`INSERT INTO public.visitor_workspace_grants (user_id, enabled) VALUES (${other}::uuid, true)
        ON CONFLICT (user_id) DO UPDATE SET enabled = true`;
      await expect(sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${other}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`INSERT INTO public.visitor_rules (site_id, user_id, name)
          VALUES (${site}::uuid, ${other}::uuid, 'Stolen')`;
      })).rejects.toThrow(/foreign key|visitor_rules_site_user_fkey/i);

      const ownRule = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`INSERT INTO public.visitor_rules (site_id, user_id, name)
          VALUES (${site}::uuid, ${owner}::uuid, 'Own') RETURNING id`;
      });
      expect(ownRule).toHaveLength(1);

      await sql`INSERT INTO public.visitor_resolve_jobs
        (site_id, user_id, visitor_key, ip_hash, status, attempts, claimed_at)
        VALUES
        (${site}::uuid, ${owner}::uuid, 'visitor', 'hash-stale', 'running', 1, now() - interval '11 minutes'),
        (${site}::uuid, ${owner}::uuid, 'visitor', 'hash-exhausted', 'running', 3, now() - interval '11 minutes')`;
      const reclaimed = await sql`SELECT ip_hash, status, attempts FROM public.claim_visitor_resolve_jobs(5)`;
      expect(reclaimed.map((row) => row.ip_hash)).toContain("hash-stale");
      expect(reclaimed.find((row) => row.ip_hash === "hash-stale")?.attempts).toBe(2);
      expect(reclaimed.map((row) => row.ip_hash)).not.toContain("hash-exhausted");
      const [exhausted] = await sql`SELECT status, ip_raw FROM public.visitor_resolve_jobs WHERE ip_hash = 'hash-exhausted'`;
      expect(exhausted.status).toBe("failed");
      expect(exhausted.ip_raw).toBeNull();

      // uq_visitor_jobs_hash. Two ingest requests for one address must not
      // create two jobs; the loser is a unique violation, not a second row.
      await expect(sql`INSERT INTO public.visitor_resolve_jobs
        (site_id, user_id, visitor_key, ip_hash)
        VALUES (${site}::uuid, ${owner}::uuid, 'visitor', 'hash-stale')`).rejects.toThrow(/duplicate|unique/i);
      const dupes = await sql`SELECT count(*)::int AS n FROM public.visitor_resolve_jobs
        WHERE site_id = ${site}::uuid AND ip_hash = 'hash-stale'`;
      expect(dupes[0].n).toBe(1);

      await expect(sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT public.claim_visitor_rule_run(${owner}::uuid, ${ownRule[0].id}::uuid, '55555555-5555-4555-8555-555555555555'::uuid)`;
      })).rejects.toThrow(/permission denied/i);

      const ruleCap = await sql`INSERT INTO public.visitor_rules (site_id, user_id, name, enabled, daily_cap)
        VALUES (${site}::uuid, ${owner}::uuid, 'Cap', true, 1) RETURNING id`;
      const matchA = await sql`INSERT INTO public.visitor_company_matches (site_id, user_id, visitor_key, status)
        VALUES (${site}::uuid, ${owner}::uuid, 'cap-a', 'unknown') RETURNING id`;
      const matchB = await sql`INSERT INTO public.visitor_company_matches (site_id, user_id, visitor_key, status)
        VALUES (${site}::uuid, ${owner}::uuid, 'cap-b', 'unknown') RETURNING id`;
      const left = postgres(PG_URL, { max: 1 });
      const right = postgres(PG_URL, { max: 1 });
      try {
        const [first, second] = await Promise.all([
          left`SELECT public.claim_visitor_rule_run(${owner}::uuid, ${ruleCap[0].id}::uuid, ${matchA[0].id}::uuid) AS ok`,
          right`SELECT public.claim_visitor_rule_run(${owner}::uuid, ${ruleCap[0].id}::uuid, ${matchB[0].id}::uuid) AS ok`,
        ]);
        const allowed = [first[0].ok, second[0].ok].filter(Boolean);
        expect(allowed).toHaveLength(1);
      } finally {
        await left.end({ timeout: 1 });
        await right.end({ timeout: 1 });
      }
      const ruleRows = await sql`SELECT count(*)::int AS n FROM public.visitor_rule_runs
        WHERE rule_id = ${ruleCap[0].id}::uuid AND status = 'running'`;
      expect(ruleRows[0].n).toBe(1);

      // One job, several rules. The workspace count used to be read once, so
      // every rule in the job still saw a free slot after the first insert.
      const filler = await sql`INSERT INTO public.visitor_rules (site_id, user_id, name, enabled, daily_cap)
        VALUES (${site}::uuid, ${owner}::uuid, 'Filler', true, 25) RETURNING id`;
      const [already] = await sql`SELECT count(*)::int AS n FROM public.visitor_rule_runs
        WHERE user_id = ${owner}::uuid AND status IN ('running', 'completed', 'failed')`;
      const need = 24 - already.n;
      for (let i = 0; i < need; i++) {
        const filled = await sql`INSERT INTO public.visitor_company_matches (site_id, user_id, visitor_key, status)
          VALUES (${site}::uuid, ${owner}::uuid, ${`fill-${i}`}, 'unknown') RETURNING id`;
        await sql`INSERT INTO public.visitor_rule_runs (rule_id, match_id, user_id, status)
          VALUES (${filler[0].id}::uuid, ${filled[0].id}::uuid, ${owner}::uuid, 'completed')`;
      }
      const rules = [];
      const matches = [];
      for (const name of ["One", "Two", "Three"]) {
        const rule = await sql`INSERT INTO public.visitor_rules (site_id, user_id, name, enabled, daily_cap)
          VALUES (${site}::uuid, ${owner}::uuid, ${name}, true, 25) RETURNING id`;
        const match = await sql`INSERT INTO public.visitor_company_matches (site_id, user_id, visitor_key, status)
          VALUES (${site}::uuid, ${owner}::uuid, ${`multi-${name}`}, 'unknown') RETURNING id`;
        rules.push(rule[0].id);
        matches.push(match[0].id);
      }
      const decisions = [];
      for (let i = 0; i < rules.length; i++) {
        const [row] = await sql`SELECT public.claim_visitor_rule_run(${owner}::uuid, ${rules[i]}::uuid, ${matches[i]}::uuid) AS ok`;
        decisions.push(row.ok);
      }
      expect(decisions.filter(Boolean)).toHaveLength(1);
      expect(decisions[0]).toBe(true);
      expect(decisions[1]).toBe(false);
      expect(decisions[2]).toBe(false);
      const workspaceRows = await sql`SELECT count(*)::int AS n FROM public.visitor_rule_runs
        WHERE user_id = ${owner}::uuid AND status IN ('running', 'completed', 'failed')`;
      expect(workspaceRows[0].n).toBe(25);
    } finally {
      await sql.end({ timeout: 1 });
    }
  });
});
