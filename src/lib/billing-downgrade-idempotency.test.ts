import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.BILLING_AUDIT_TEST_URL;
const migration = readFileSync("drizzle/migrations/0066_billing_downgrade_idempotency.sql", "utf8");
const original = readFileSync("drizzle/migrations/0015_billing_lifecycle_auto_downgrade_and_logging.sql", "utf8");
const helper = original.slice(original.indexOf("CREATE OR REPLACE FUNCTION public.billing_downgrade_to_free"), original.indexOf("CREATE OR REPLACE FUNCTION public.billing_restore_previous_plan"));
const auditStart = original.indexOf("CREATE OR REPLACE FUNCTION public.admin_get_billing_audit");
const audit = original.slice(auditStart, original.indexOf("$function$;", auditStart) + 11);

describe.skipIf(!url)("billing downgrade audit", () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(async () => {
    if (!url?.includes("127.0.0.1")) throw new Error("Local isolated database required");
    sql = postgres(url, { max: 4 });
    await sql.unsafe(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
      CREATE TYPE subscription_plan AS ENUM ('free','starter','growth','pro','elite','agency'); CREATE TYPE app_role AS ENUM ('admin','user');
      CREATE FUNCTION has_role(uuid, app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,email text); CREATE TABLE subscriptions(user_id uuid PRIMARY KEY,plan subscription_plan,previous_plan subscription_plan,search_credits_base int,search_credits_remaining int,leads_limit int,stripe_customer_id text,updated_at timestamptz);
      CREATE TABLE audit_logs(id uuid DEFAULT gen_random_uuid(),user_id uuid,action text,entity_type text,entity_id uuid,old_values jsonb,new_values jsonb,metadata jsonb,ip_address text,created_at timestamptz DEFAULT now());
      CREATE TABLE stripe_webhook_events(id uuid,created_at timestamptz,event_type text,status text,event_id text,attempts int,last_error text,processed_at timestamptz,payload jsonb);
      ${helper}${audit}`);
    await sql.unsafe(migration);
  });
  afterAll(async () => { if (sql) await sql.end(); });

  it("records one downgrade when two checks overlap for a paid account", async () => {
    const id = crypto.randomUUID();
    await sql`INSERT INTO subscriptions(user_id,plan,search_credits_remaining) VALUES (${id},'pro',500)`;
    const results = await Promise.all([1, 2].map(() => sql`SELECT billing_downgrade_to_free(${id},'Reconciliation','{"trigger":"reconciliation"}') AS changed`));
    expect(results.map((r) => r[0].changed).sort()).toEqual([false, true]);
    const [{ count }] = await sql`SELECT count(*)::int FROM audit_logs WHERE user_id=${id}`;
    expect(count).toBe(1);
  });
  it("does not record an already-Free account as downgraded again", async () => {
    const id = crypto.randomUUID();
    await sql`INSERT INTO subscriptions(user_id,plan) VALUES (${id},'free')`;
    const [row] = await sql`SELECT billing_downgrade_to_free(${id},'Reconciliation','{"trigger":"reconciliation"}') AS changed`;
    expect(row.changed).toBe(false);
    const [{ count }] = await sql`SELECT count(*)::int FROM audit_logs WHERE user_id=${id}`;
    expect(count).toBe(0);
  });
  it("hides old reconciliation Free-to-Free repeats but keeps real downgrades", async () => {
    const id = crypto.randomUUID();
    await sql`INSERT INTO audit_logs(user_id,action,entity_id,old_values,new_values,metadata) VALUES
      (${id},'billing_downgrade_to_free',${id},'{"plan":"free"}','{"plan":"free"}','{"trigger":"reconciliation"}'),
      (${id},'billing_downgrade_to_free',${id},'{"plan":"pro"}','{"plan":"free"}','{"trigger":"reconciliation"}')`;
    const rows = await sql`SELECT details FROM admin_get_billing_audit(NULL,NULL,500,0) WHERE target_user_id=${id}`;
    expect(rows.map((r) => r.details.old_values.plan)).toEqual(["pro"]);
  });
});