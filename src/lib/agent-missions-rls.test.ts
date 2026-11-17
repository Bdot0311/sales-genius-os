import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";

describe("agent mission claims and tenant isolation", () => {
  it("keeps the flag off, isolates workspaces, and claims a window once", async (ctx) => {
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
          target_plans text[]
        );
        DELETE FROM public.feature_flags WHERE name = 'agentMissions';
        CREATE TABLE IF NOT EXISTS public.agent_configs (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL
        );
        CREATE TABLE IF NOT EXISTS public.icp_profiles (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL
        );
        CREATE TABLE IF NOT EXISTS public.email_sequences (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL
        );
        CREATE TABLE IF NOT EXISTS public.agent_jobs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL,
          agent_config_id uuid,
          kind text NOT NULL DEFAULT 'draft',
          request_text text,
          autonomy text NOT NULL DEFAULT 'approval',
          goal text NOT NULL DEFAULT 'introduction',
          status text NOT NULL DEFAULT 'queued',
          total integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS public.agent_job_items (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          job_id uuid NOT NULL,
          user_id uuid NOT NULL,
          lead_id uuid,
          status text NOT NULL DEFAULT 'pending',
          payload jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );`;
      const [me] = await sql`SELECT current_user AS name, rolsuper FROM pg_roles WHERE rolname = current_user`;
      if (me.rolsuper) await sql.unsafe(bootstrap);
      else {
        const dbName = new URL(PG_URL).pathname.replace(/^\//, "") || "audit_test";
        const member = String(me.name).replace(/"/g, "");
        execFileSync("sudo", ["-u", "postgres", "psql", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-c",
          `${bootstrap}\nGRANT anon, authenticated, service_role TO "${member}";`], { stdio: "pipe" });
      }
      await sql.unsafe(readFileSync("supabase/migrations/20261117120000_agent_missions.sql", "utf8"));

      const owner = crypto.randomUUID();
      const other = crypto.randomUUID();
      const agent = crypto.randomUUID();
      const foreignAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES (${agent}::uuid, ${owner}::uuid), (${foreignAgent}::uuid, ${other}::uuid)`;

      const [off] = await sql`SELECT is_enabled FROM public.feature_flags WHERE name = 'agentMissions'`;
      expect(off.is_enabled).toBe(false);

      const hidden = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT public.agent_missions_enabled() AS on`;
      });
      expect(hidden[0].on).toBe(false);

      await sql`UPDATE public.feature_flags SET is_enabled = true WHERE name = 'agentMissions'`;
      await sql`INSERT INTO public.agent_mission_grants (user_id, enabled) VALUES (${owner}::uuid, true)`;
      const mission = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, mode, status, timezone, days_of_week, run_hour, run_minute, next_run_at
      ) VALUES (
        ${owner}::uuid, ${agent}::uuid, 'Ops', 'Find ops leaders', 'approval', 'active',
        'America/New_York', ARRAY[1,2,3,4,5]::smallint[], 7, 0, now() - interval '1 minute'
      ) RETURNING id`;

      await expect(sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, next_run_at
      ) VALUES (
        ${owner}::uuid, ${foreignAgent}::uuid, 'Cross', 'Nope', now()
      )`).rejects.toThrow(/agent_missions_agent_fkey|foreign key/i);

      const seen = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT name FROM public.agent_missions`;
      });
      expect(seen.map((row) => row.name)).toEqual(["Ops"]);

      const otherSees = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${other}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT id FROM public.agent_missions`;
      });
      expect(otherSees).toEqual([]);

      await expect(sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT public.claim_agent_mission_run(${mission[0].id}::uuid)`;
      })).rejects.toThrow(/permission denied/i);

      const [next] = await sql`SELECT public.agent_mission_next_run(
        '2026-11-16 22:00:00+00'::timestamptz, 'America/New_York', ARRAY[1,2,3,4,5]::smallint[], 7, 0
      ) AS at`;
      expect(new Date(next.at).toISOString()).toBe("2026-11-17T12:00:00.000Z");

      const [firstClaim] = await sql`SELECT public.claim_agent_mission_run(${mission[0].id}::uuid) AS id`;
      expect(firstClaim.id).toBeTruthy();
      const [secondClaim] = await sql`SELECT public.claim_agent_mission_run(${mission[0].id}::uuid) AS id`;
      expect(secondClaim.id).toBeNull();

      const raceMission = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, status, next_run_at
      ) VALUES (
        ${owner}::uuid, ${agent}::uuid, 'Race', 'Find more', 'active', now() - interval '1 minute'
      ) RETURNING id`;
      const left = postgres(PG_URL, { max: 1 });
      const right = postgres(PG_URL, { max: 1 });
      try {
        const [a, b] = await Promise.all([
          left`SELECT public.claim_agent_mission_run(${raceMission[0].id}::uuid) AS id`,
          right`SELECT public.claim_agent_mission_run(${raceMission[0].id}::uuid) AS id`,
        ]);
        const won = [a[0].id, b[0].id].filter(Boolean);
        expect(won).toHaveLength(1);
      } finally {
        await left.end({ timeout: 1 });
        await right.end({ timeout: 1 });
      }
      const [runs] = await sql`SELECT count(*)::int AS n FROM public.agent_mission_runs WHERE mission_id = ${raceMission[0].id}::uuid`;
      expect(runs.n).toBe(1);

      const queued = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, mode, status, next_run_at
      ) VALUES (
        ${owner}::uuid, ${agent}::uuid, 'Queue', 'Find and draft', 'autopilot', 'active', now() - interval '1 minute'
      ) RETURNING id`;
      const [enqueued] = await sql`SELECT public.enqueue_due_agent_missions() AS n`;
      expect(Number(enqueued.n)).toBeGreaterThanOrEqual(1);
      const jobs = await sql`SELECT j.id FROM public.agent_jobs j
        JOIN public.agent_mission_runs r ON r.job_id = j.id
        WHERE r.mission_id = ${queued[0].id}::uuid AND j.kind = 'mission'`;
      expect(jobs).toHaveLength(1);
      await sql`SELECT public.enqueue_due_agent_missions()`;
      const jobsAgain = await sql`SELECT j.id FROM public.agent_jobs j
        JOIN public.agent_mission_runs r ON r.job_id = j.id
        WHERE r.mission_id = ${queued[0].id}::uuid`;
      expect(jobsAgain).toHaveLength(1);
      const [runCount] = await sql`SELECT count(*)::int AS n FROM public.agent_mission_runs WHERE mission_id = ${queued[0].id}::uuid`;
      expect(runCount.n).toBe(1);
    } finally {
      await sql.end({ timeout: 1 });
    }
  });
});
