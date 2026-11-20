import { PG_ROLE_BOOTSTRAP_SQL } from "./test-support/pg-bootstrap";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const COACH = readFileSync("supabase/functions/ai-coach/index.ts", "utf8");
const MIGRATION_PATH = "supabase/migrations/20261116153000_ai_coach_quota.sql";
const MIGRATION = readFileSync(MIGRATION_PATH, "utf8");

/**
 * The tier scan counts every `model:` in the function. A quota insert that
 * names a model is not a generation, and it must not be how the cap is stored.
 */
describe("coach quota is a reservation, not a model request", () => {
  it("keeps the plan limits and the one strong-tier generation", () => {
    expect(COACH).toContain("free: 5");
    expect(COACH).toContain("starter: 50");
    expect(COACH).toContain("growth: 200");
    expect(COACH).toContain("pro: 750");
    expect(COACH).toContain("agency: -1");
    const total = [...COACH.matchAll(/\bmodel: /g)].length;
    const smart = [...COACH.matchAll(/\bmodel: AI_SMART\b/g)].length;
    expect(total).toBe(1);
    expect(smart).toBe(total);
    expect(COACH).not.toContain("ai_usage_events");
    expect(COACH).not.toContain("Math.max");
  });

  it("claims on the service role before the provider call, and only a success keeps the reservation", () => {
    expect(COACH).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(COACH).not.toContain("SUPABASE_ANON_KEY");
    const claimAt = COACH.indexOf('rpc("claim_ai_coach_message"');
    const fetchAt = COACH.indexOf('aiFetch("ai-coach"');
    const notOk = COACH.indexOf("if (!response.ok)");
    const releaseOnError = COACH.indexOf('settleQuota("release")', notOk);
    const consumeAt = COACH.indexOf('settleQuota("consume")');
    const catchAt = COACH.indexOf("} catch (error");
    const releaseOnThrow = COACH.indexOf('settleQuota("release")', catchAt);
    expect(claimAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(claimAt);
    expect(releaseOnError).toBeGreaterThan(notOk);
    expect(releaseOnError).toBeLessThan(consumeAt);
    expect(consumeAt).toBeLessThan(catchAt);
    expect(releaseOnThrow).toBeGreaterThan(catchAt);
    expect(COACH.match(/settleQuota\("release"\)/g)).toHaveLength(2);
    expect(COACH.match(/settleQuota\("consume"\)/g)).toHaveLength(1);
  });

  it("locks the check and the insert, and customers cannot write the ledger", () => {
    expect(MIGRATION).toContain("pg_advisory_xact_lock(hashtextextended('ai-coach:'");
    expect(MIGRATION).toContain("interval '3 minutes'");
    expect(MIGRATION).toContain("interval '2 minutes'");
    expect(MIGRATION).toContain("status = 'consumed'");
    expect(MIGRATION).toContain("status = 'released'");
    expect(MIGRATION).toContain("REVOKE ALL ON TABLE public.ai_coach_quota FROM PUBLIC, anon, authenticated");
    expect(MIGRATION).toContain("GRANT ALL ON TABLE public.ai_coach_quota TO service_role");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.claim_ai_coach_message(uuid, timestamptz, integer) TO service_role");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.consume_ai_coach_message(uuid, uuid) TO service_role");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION public.release_ai_coach_message(uuid, uuid) TO service_role");
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.claim_ai_coach_message(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated");
    expect(MIGRATION).toContain("'ai_coach_quota'");
    expect(MIGRATION).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*TO\s+(authenticated|anon)/);
  });
});

describe("the webhook test payload stays server-built", () => {
  it("still posts the registered url, and the function does not relay a caller payload", () => {
    const fn = readFileSync("supabase/functions/test-webhook/index.ts", "utf8");
    const ui = readFileSync("src/components/settings/WebhookTestDialog.tsx", "utf8");
    expect(fn).toContain('event: "webhook.test"');
    expect(fn).toContain("const { url, secret } = await req.json()");
    expect(fn).not.toMatch(/const\s*\{[^}]*\bpayload\b/);
    expect(ui).toContain('invoke("test-webhook"');
    expect(ui).toContain("url: webhook.url");
  });
});

const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";

type Claim = { id: string | null; allowed: boolean; used: number };

function asClaim(value: unknown): Claim {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") throw new Error("claim result missing");
  const row = parsed as { id?: string | null; allowed?: boolean; used?: number | string };
  return {
    id: row.id ?? null,
    allowed: row.allowed === true,
    used: Number(row.used ?? 0),
  };
}

describe("coach quota claims are atomic", () => {
  it("caps concurrent calls, ignores failures, and blocks customer writes", async (ctx) => {
    if (!PG_URL.includes("127.0.0.1") && !PG_URL.includes("localhost")) {
      throw new Error("refusing to run the quota test outside local postgres");
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

    const roles = `
      ${PG_ROLE_BOOTSTRAP_SQL}
      CREATE TABLE IF NOT EXISTS public.coaching_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        role text NOT NULL,
        content text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now()
      );`;
    try {
      const [me] = await sql`SELECT current_user AS name, rolsuper FROM pg_roles WHERE rolname = current_user`;
      if (me.rolsuper) await sql.unsafe(roles);
      else {
        const dbName = new URL(PG_URL).pathname.replace(/^\//, "") || "audit_test";
        const member = String(me.name).replace(/"/g, "");
        execFileSync("sudo", ["-u", "postgres", "psql", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-c",
          `${roles}\nGRANT anon, authenticated, service_role TO "${member}";`], { stdio: "pipe" });
      }
      await sql.unsafe(MIGRATION);

      // The function counts from the timestamp the caller passes. A window
      // ending at now() keeps "earlier this period" and "previous period"
      // stable on any day of the month.
      const claim = async (userId: string, limit: number | null) => {
        const [row] = await sql!`SELECT public.claim_ai_coach_message(
          ${userId}::uuid, now() - interval '30 days', ${limit}::int) AS result`;
        return asClaim(row.result);
      };
      const user = crypto.randomUUID();
      const other = crypto.randomUUID();

      const first = await claim(user, 1);
      expect(first.allowed).toBe(true);
      expect(first.used).toBe(0);
      expect(first.id).toBeTruthy();
      const second = await claim(user, 1);
      expect(second.allowed).toBe(false);
      expect(second.used).toBe(1);
      expect(second.id).toBeNull();

      const [released] = await sql`SELECT public.release_ai_coach_message(${first.id}::uuid, ${user}::uuid) AS ok`;
      expect(released.ok).toBe(true);
      const [releasedRow] = await sql`SELECT status FROM public.ai_coach_quota WHERE id = ${first.id}::uuid`;
      expect(releasedRow.status).toBe("released");
      const afterFailure = await claim(user, 1);
      expect(afterFailure.allowed).toBe(true);
      expect(afterFailure.used).toBe(0);

      const [consumed] = await sql`SELECT public.consume_ai_coach_message(${afterFailure.id}::uuid, ${user}::uuid) AS ok`;
      expect(consumed.ok).toBe(true);
      const [undo] = await sql`SELECT public.release_ai_coach_message(${afterFailure.id}::uuid, ${user}::uuid) AS ok`;
      expect(undo.ok).toBe(false);
      const [kept] = await sql`SELECT status FROM public.ai_coach_quota WHERE id = ${afterFailure.id}::uuid`;
      expect(kept.status).toBe("consumed");
      const [stolen] = await sql`SELECT public.release_ai_coach_message(${afterFailure.id}::uuid, ${other}::uuid) AS ok`;
      expect(stolen.ok).toBe(false);

      const blocked = await claim(user, 1);
      expect(blocked.allowed).toBe(false);
      expect(blocked.used).toBe(1);

      // A hold left behind by a crash stops counting once the provider timeout
      // has passed. A fresh hold still occupies the slot.
      const staleUser = crypto.randomUUID();
      await sql`INSERT INTO public.ai_coach_quota (user_id, status, created_at)
        VALUES (${staleUser}::uuid, 'held', now() - interval '10 minutes')`;
      const afterCrash = await claim(staleUser, 1);
      expect(afterCrash.allowed).toBe(true);
      expect(afterCrash.used).toBe(0);
      const liveUser = crypto.randomUUID();
      await sql`INSERT INTO public.ai_coach_quota (user_id, status, created_at)
        VALUES (${liveUser}::uuid, 'held', now())`;
      const inFlight = await claim(liveUser, 1);
      expect(inFlight.allowed).toBe(false);
      expect(inFlight.used).toBe(1);

      // Saved coach messages from earlier in the month still count. The message
      // the page just saved is this request, so it does not count twice, and a
      // direct call cannot hide behind a higher message total.
      const historyUser = crypto.randomUUID();
      for (let i = 0; i < 4; i++) {
        await sql`INSERT INTO public.coaching_messages (user_id, role, content, created_at)
          VALUES (${historyUser}::uuid, 'user', 'earlier', now() - interval '10 days')`;
      }
      await sql`INSERT INTO public.coaching_messages (user_id, role, content, created_at)
        VALUES (${historyUser}::uuid, 'assistant', 'reply', now() - interval '10 days')`;
      await sql`INSERT INTO public.coaching_messages (user_id, role, content, created_at)
        VALUES (${other}::uuid, 'user', 'someone else', now() - interval '10 days')`;
      await sql`INSERT INTO public.coaching_messages (user_id, role, content, created_at)
        VALUES (${historyUser}::uuid, 'user', 'last month', now() - interval '40 days')`;
      const withHistory = await claim(historyUser, 5);
      expect(withHistory.allowed).toBe(true);
      expect(withHistory.used).toBe(4);
      await sql`SELECT public.consume_ai_coach_message(${withHistory.id}::uuid, ${historyUser}::uuid)`;
      const historyFull = await claim(historyUser, 5);
      expect(historyFull.allowed).toBe(false);
      expect(historyFull.used).toBe(5);

      const pageUser = crypto.randomUUID();
      const [justSaved] = await sql`INSERT INTO public.coaching_messages (user_id, role, content, created_at)
        VALUES (${pageUser}::uuid, 'user', 'just now', now()) RETURNING id`;
      const pageCall = await claim(pageUser, 1);
      expect(pageCall.allowed).toBe(true);
      expect(pageCall.used).toBe(0);
      const [covered] = await sql`SELECT message_id, status FROM public.ai_coach_quota WHERE id = ${pageCall.id}::uuid`;
      expect(covered.message_id).toBe(justSaved.id);
      expect(covered.status).toBe("held");
      await sql`SELECT public.release_ai_coach_message(${pageCall.id}::uuid, ${pageUser}::uuid)`;
      const [stillCovered] = await sql`SELECT status, message_id FROM public.ai_coach_quota WHERE id = ${pageCall.id}::uuid`;
      expect(stillCovered.status).toBe("released");
      expect(stillCovered.message_id).toBe(justSaved.id);
      const retry = await claim(pageUser, 1);
      expect(retry.allowed).toBe(true);
      expect(retry.used).toBe(0);

      const twoFresh = crypto.randomUUID();
      await sql`INSERT INTO public.coaching_messages (user_id, role, content, created_at)
        VALUES (${twoFresh}::uuid, 'user', 'older recent', now() - interval '30 seconds')`;
      await sql`INSERT INTO public.coaching_messages (user_id, role, content, created_at)
        VALUES (${twoFresh}::uuid, 'user', 'newest', now())`;
      const notAllRecent = await claim(twoFresh, 1);
      expect(notAllRecent.allowed).toBe(false);
      expect(notAllRecent.used).toBe(1);

      const agency = crypto.randomUUID();
      await sql`INSERT INTO public.coaching_messages (user_id, role, content, created_at)
        VALUES (${agency}::uuid, 'user', 'many', now() - interval '10 days')`;
      const unlimited = await claim(agency, -1);
      expect(unlimited.allowed).toBe(true);
      expect(unlimited.id).toBeTruthy();

      const closed = await claim(crypto.randomUUID(), null);
      expect(closed.allowed).toBe(false);

      const raced = crypto.randomUUID();
      const clients = Array.from({ length: 6 }, () => postgres(PG_URL, { max: 1 }));
      try {
        const results = await Promise.all(clients.map((client) =>
          client`SELECT public.claim_ai_coach_message(${raced}::uuid, now() - interval '30 days', 2) AS result`));
        expect(results.map((row) => asClaim(row[0].result).allowed).filter(Boolean)).toHaveLength(2);
      } finally {
        await Promise.all(clients.map((client) => client.end({ timeout: 1 })));
      }
      const [raceRows] = await sql`SELECT count(*)::int AS n FROM public.ai_coach_quota
        WHERE user_id = ${raced}::uuid AND status = 'held'`;
      expect(raceRows.n).toBe(2);

      const leftUser = crypto.randomUUID();
      const rightUser = crypto.randomUUID();
      const left = postgres(PG_URL, { max: 1 });
      const right = postgres(PG_URL, { max: 1 });
      try {
        const [a, b] = await Promise.all([
          left`SELECT public.claim_ai_coach_message(${leftUser}::uuid, now() - interval '30 days', 1) AS result`,
          right`SELECT public.claim_ai_coach_message(${rightUser}::uuid, now() - interval '30 days', 1) AS result`,
        ]);
        expect(asClaim(a[0].result).allowed).toBe(true);
        expect(asClaim(b[0].result).allowed).toBe(true);
      } finally {
        await left.end({ timeout: 1 });
        await right.end({ timeout: 1 });
      }

      const asCustomer = async (run: (tx: any) => Promise<unknown>) => {
        await expect(sql!.begin(async (tx) => {
          await tx`SET LOCAL ROLE authenticated`;
          await run(tx);
        })).rejects.toThrow(/permission denied/i);
      };
      await asCustomer((tx) => tx`INSERT INTO public.ai_coach_quota (user_id) VALUES (${user}::uuid)`);
      await asCustomer((tx) => tx`UPDATE public.ai_coach_quota SET status = 'released' WHERE user_id = ${user}::uuid`);
      await asCustomer((tx) => tx`DELETE FROM public.ai_coach_quota WHERE user_id = ${user}::uuid`);
      await asCustomer((tx) => tx`SELECT id FROM public.ai_coach_quota WHERE user_id = ${user}::uuid`);
      await asCustomer((tx) => tx`SELECT public.claim_ai_coach_message(${user}::uuid, now() - interval '30 days', 5)`);
      await asCustomer((tx) => tx`SELECT public.consume_ai_coach_message(${first.id}::uuid, ${user}::uuid)`);
      await asCustomer((tx) => tx`SELECT public.release_ai_coach_message(${first.id}::uuid, ${user}::uuid)`);
    } finally {
      await sql.end({ timeout: 1 });
    }
  });
});
