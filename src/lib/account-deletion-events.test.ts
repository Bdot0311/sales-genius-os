import { readFileSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.ACCOUNT_DELETION_TEST_URL;
const migration = readFileSync("drizzle/migrations/0075_guard_mailbox_events_during_account_deletion.sql", "utf8");
const originalFile = readFileSync("supabase/migrations/20260902120000_deliverability_event_capture.sql", "utf8");
const original = originalFile.slice(originalFile.indexOf("CREATE OR REPLACE FUNCTION"), originalFile.indexOf("DROP TRIGGER"));

describe.skipIf(!url)("account deletion mailbox events", () => {
  let sql: ReturnType<typeof postgres>;
  let baselineError: string | undefined;
  beforeAll(async () => {
    if (!url?.includes("127.0.0.1")) throw new Error("Isolated local database required");
    sql = postgres(url, { max: 1 });
    await sql.unsafe(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.sending_accounts(
        id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
        email text, demo_seed boolean DEFAULT false, status text DEFAULT 'active',
        paused_reason text, daily_limit int DEFAULT 10, warmup_enabled boolean DEFAULT false
      );
      CREATE TABLE public.deliverability_events(
        id uuid DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
        sending_account_id uuid REFERENCES public.sending_accounts(id) ON DELETE SET NULL,
        event_type text, title text, detail text, domain text, metadata jsonb
      );
      ${original}
      CREATE TRIGGER mailbox_events AFTER INSERT OR UPDATE OR DELETE ON public.sending_accounts
        FOR EACH ROW EXECUTE FUNCTION public.record_deliverability_event();
    `);
    try {
      await sql.begin(async (tx) => {
        const owner = crypto.randomUUID();
        await tx`INSERT INTO auth.users VALUES (${owner})`;
        await tx`INSERT INTO sending_accounts(id,user_id,email) VALUES (${crypto.randomUUID()},${owner},'local-test@example.invalid')`;
        await tx`DELETE FROM auth.users WHERE id=${owner}`;
      });
    } catch (error) {
      baselineError = (error as { code?: string }).code;
    }
    await sql.unsafe(migration);
  });
  afterAll(async () => { if (sql) await sql.end(); });

  it("reproduces the original foreign-key error before the fix", () => {
    expect(baselineError).toBe("23503");
  });
  it("deletes an owner with a connected mailbox without recreating owner events", async () => {
    const owner = crypto.randomUUID();
    await sql`INSERT INTO auth.users VALUES (${owner})`;
    await sql`INSERT INTO sending_accounts(id,user_id,email) VALUES (${crypto.randomUUID()},${owner},'cascade@example.invalid')`;
    await sql`DELETE FROM auth.users WHERE id=${owner}`;
    const [row] = await sql`SELECT (SELECT count(*)::int FROM auth.users WHERE id=${owner}) AS users,
      (SELECT count(*)::int FROM sending_accounts WHERE user_id=${owner}) AS mailboxes,
      (SELECT count(*)::int FROM deliverability_events WHERE user_id=${owner}) AS events`;
    expect(row).toEqual({ users: 0, mailboxes: 0, events: 0 });
  });
  it("keeps one normal mailbox-removal event even without a profile", async () => {
    const owner = crypto.randomUUID();
    const mailbox = crypto.randomUUID();
    await sql`INSERT INTO auth.users VALUES (${owner})`;
    await sql`INSERT INTO sending_accounts(id,user_id,email) VALUES (${mailbox},${owner},'disconnect@example.invalid')`;
    await sql`DELETE FROM sending_accounts WHERE id=${mailbox}`;
    const rows = await sql`SELECT event_type,sending_account_id FROM deliverability_events WHERE user_id=${owner} AND event_type='mailbox_removed'`;
    expect(rows).toEqual([{ event_type: "mailbox_removed", sending_account_id: null }]);
  });
  it("still records mailbox status changes", async () => {
    const owner = crypto.randomUUID();
    const mailbox = crypto.randomUUID();
    await sql`INSERT INTO auth.users VALUES (${owner})`;
    await sql`INSERT INTO sending_accounts(id,user_id,email) VALUES (${mailbox},${owner},'pause@example.invalid')`;
    await sql`UPDATE sending_accounts SET status='paused',paused_reason='Manual pause' WHERE id=${mailbox}`;
    const rows = await sql`SELECT event_type,detail FROM deliverability_events WHERE user_id=${owner} AND event_type='mailbox_paused'`;
    expect(rows).toEqual([{ event_type: "mailbox_paused", detail: "Manual pause" }]);
  });
  it("does not create events for demo mailbox removal", async () => {
    const owner = crypto.randomUUID();
    const mailbox = crypto.randomUUID();
    await sql`INSERT INTO auth.users VALUES (${owner})`;
    await sql`INSERT INTO sending_accounts(id,user_id,email,demo_seed) VALUES (${mailbox},${owner},'demo@example.invalid',true)`;
    await sql`DELETE FROM sending_accounts WHERE id=${mailbox}`;
    const [row] = await sql`SELECT count(*)::int AS count FROM deliverability_events WHERE user_id=${owner}`;
    expect(row.count).toBe(0);
  });
});