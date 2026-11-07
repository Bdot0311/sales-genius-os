import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";

describe("research snapshots are service-written", () => {
  it("lets the owner read a row and refuses insert, update, and another tenant", async () => {
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
        $$;`;
      const [me] = await sql`SELECT current_user AS name, rolsuper FROM pg_roles WHERE rolname = current_user`;
      if (me.rolsuper) await sql.unsafe(bootstrap);
      else {
        const dbName = new URL(PG_URL).pathname.replace(/^\//, "") || "audit_test";
        const member = String(me.name).replace(/"/g, "");
        execFileSync("sudo", ["-u", "postgres", "psql", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-c",
          `${bootstrap}\nGRANT anon, authenticated, service_role TO "${member}";`], { stdio: "pipe" });
      }
      await sql.unsafe(readFileSync("supabase/migrations/20261107120000_research_snapshots.sql", "utf8"));
      await sql.unsafe(readFileSync("supabase/migrations/20261107133000_research_run_lock.sql", "utf8"));
      await sql.unsafe(readFileSync("supabase/migrations/20261107143000_research_claim_and_mutation.sql", "utf8"));
      const owner = crypto.randomUUID();
      const other = crypto.randomUUID();
      const lead = crypto.randomUUID();
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE service_role`;
        await tx`INSERT INTO public.research_snapshots (user_id, lead_id, payload)
          VALUES (${owner}::uuid, ${lead}::uuid, ${sql.json({ excerpt: "TF Business Solutions hires freight brokers." })})`;
      });
      const seen = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT payload->>'excerpt' AS excerpt FROM public.research_snapshots WHERE lead_id = ${lead}::uuid`;
      });
      expect(seen.map((row) => row.excerpt)).toEqual(["TF Business Solutions hires freight brokers."]);
      const hidden = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${other}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT id FROM public.research_snapshots WHERE lead_id = ${lead}::uuid`;
      });
      expect(hidden).toEqual([]);
      await expect(sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`INSERT INTO public.research_snapshots (user_id, lead_id, payload)
          VALUES (${owner}::uuid, ${lead}::uuid, '{"forged":true}'::jsonb)`;
      })).rejects.toThrow(/permission denied/i);
      await expect(sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`UPDATE public.research_snapshots SET payload = '{"forged":true}'::jsonb WHERE lead_id = ${lead}::uuid`;
      })).rejects.toThrow(/permission denied/i);
      await expect(sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE anon`;
        await tx`SELECT id FROM public.research_snapshots`;
      })).rejects.toThrow(/permission denied/i);
      const [first, second] = await Promise.all([
        sql`SELECT public.begin_research_run(${owner}::uuid, ${lead}::uuid, false) AS id`,
        sql`SELECT public.begin_research_run(${owner}::uuid, ${lead}::uuid, false) AS id`,
      ]);
      const ids = [first[0].id, second[0].id].filter(Boolean);
      expect(ids).toHaveLength(1);
      await expect(sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT public.begin_research_run(${owner}::uuid, ${lead}::uuid, false)`;
      })).rejects.toThrow(/permission denied/i);
    } finally {
      await sql.end({ timeout: 1 });
    }
  });
});
