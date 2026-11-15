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
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
        END $$;
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
          SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
        $$;
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
    } finally {
      await sql.end({ timeout: 1 });
    }
  });
});
