import { readFileSync } from "node:fs";
import postgres from "postgres";
import { beforeAll, afterAll, describe, expect, it } from "vitest";

const url = process.env.ADMIN_HEALTH_TEST_URL;
const migration = readFileSync("drizzle/migrations/0065_admin_billing_and_private_policy_health.sql", "utf8");

describe.skipIf(!url)("admin billing and private policy health", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(async () => {
    if (!url || !url.includes("127.0.0.1")) throw new Error("Local isolated database required");
    sql = postgres(url, { max: 1 });
    await sql.unsafe(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.user_roles (user_id uuid, role text, UNIQUE(user_id,role));
      CREATE TABLE public.subscriptions (user_id uuid PRIMARY KEY, billing_exempt boolean NOT NULL DEFAULT false, plan text DEFAULT 'free');
      CREATE TABLE public.outbound_gate_canary (id int);
      ALTER TABLE public.outbound_gate_canary ENABLE ROW LEVEL SECURITY;
      GRANT SELECT,INSERT,UPDATE,DELETE ON public.outbound_gate_canary TO service_role;
      CREATE FUNCTION public._system_health_checks() RETURNS jsonb LANGUAGE plpgsql AS $body$
      DECLARE v_count int; v_detail text; BEGIN
        SELECT count(*), coalesce(string_agg(c.relname, ', '), '') INTO v_count,v_detail
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
        AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);
        RETURN jsonb_build_object('count',v_count,'detail',v_detail);
      END; $body$;
    `);
    await sql.unsafe(migration);
  });
  afterAll(async () => { if (sql) await sql.end(); });

  it("the owner's Agency admin is exempt even if exemption is reset", async () => {
    const id = crypto.randomUUID();
    await sql`INSERT INTO user_roles VALUES (${id},'admin')`;
    await sql`INSERT INTO subscriptions(user_id,plan) VALUES (${id},'agency')`;
    await sql`UPDATE subscriptions SET billing_exempt=false WHERE user_id=${id}`;
    const [row] = await sql`SELECT billing_exempt,plan FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ billing_exempt: true, plan: "agency" });
  });
  it("future admins become exempt on promotion without changing their plan", async () => {
    const id = crypto.randomUUID();
    await sql`INSERT INTO subscriptions(user_id,plan) VALUES (${id},'pro')`;
    await sql`INSERT INTO user_roles VALUES (${id},'admin')`;
    const [row] = await sql`SELECT billing_exempt,plan FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ billing_exempt: true, plan: "pro" });
  });
  it("regular free and paid customers do not receive admin exemptions", async () => {
    for (const plan of ["free", "starter", "growth", "pro", "agency"]) {
      const id = crypto.randomUUID();
      await sql`INSERT INTO subscriptions(user_id,plan) VALUES (${id},${plan})`;
      await sql`INSERT INTO user_roles VALUES (${id},'user')`;
      const [row] = await sql`SELECT billing_exempt,plan FROM subscriptions WHERE user_id=${id}`;
      expect(row).toEqual({ billing_exempt: false, plan });
    }
  });
  it("removing admin privileges removes the automatic exemption", async () => {
    const id = crypto.randomUUID();
    await sql`INSERT INTO subscriptions(user_id) VALUES (${id})`;
    await sql`INSERT INTO user_roles VALUES (${id},'admin')`;
    await sql`DELETE FROM user_roles WHERE user_id=${id} AND role='admin'`;
    const [row] = await sql`SELECT billing_exempt FROM subscriptions WHERE user_id=${id}`;
    expect(row.billing_exempt).toBe(false);
  });
  it("healthy internal tables do not warn, but lost backend access still warns", async () => {
    const [healthy] = await sql`SELECT _system_health_checks() AS report`;
    expect(healthy.report.count).toBe(0);
    await sql`REVOKE SELECT ON outbound_gate_canary FROM service_role`;
    const [broken] = await sql`SELECT _system_health_checks() AS report`;
    expect(broken.report).toEqual({ count: 1, detail: "outbound_gate_canary" });
    await sql`GRANT SELECT ON outbound_gate_canary TO service_role`;
  });
  it("customer-readable internal tables and unrelated locked tables still warn", async () => {
    await sql`GRANT SELECT ON outbound_gate_canary TO authenticated`;
    const [unsafe] = await sql`SELECT _system_health_checks() AS report`;
    expect(unsafe.report.count).toBe(1);
    await sql`REVOKE SELECT ON outbound_gate_canary FROM authenticated`;
    await sql`CREATE TABLE unexpected_locked (id int)`;
    await sql`ALTER TABLE unexpected_locked ENABLE ROW LEVEL SECURITY`;
    const [locked] = await sql`SELECT _system_health_checks() AS report`;
    expect(locked.report).toEqual({ count: 1, detail: "unexpected_locked" });
  });
});