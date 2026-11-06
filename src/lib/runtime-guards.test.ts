import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postgres from "postgres";
import { readCoachDeltaStream } from "./coach-stream";
import { claimSupportedByCorpus } from "../../supabase/functions/_shared/research-citation";
import { applySearchMeter } from "../../supabase/functions/_shared/search-meter";
import { sweepSlice } from "../../supabase/functions/_shared/sweep-window";
import { queuedCopyBlockers } from "../../supabase/functions/_shared/template-send-gate";
import {
  deliverReserved,
  type OutboundStore,
} from "../../supabase/functions/_shared/tracked-send";

/**
 * In-memory mailbox reservation with the same unique rule as the migration.
 * Two callers can race the insert; only one key is stored.
 */
function memoryStore() {
  const rows = new Map<string, { id: string; key: string; attempted: boolean; status: string; messageId?: string }>();
  let seq = 0;
  const keyOf = (userId: string, to: string, subject: string) => `${userId}|${to}|${subject}`;
  const store: OutboundStore = {
    findAttempted: async (userId, to, subject) => {
      for (const row of rows.values()) {
        if (row.key === keyOf(userId, to, subject) && row.status === "pending" && row.attempted) return { id: row.id };
      }
      return null;
    },
    insertPending: async (row) => {
      const key = keyOf(row.userId, row.to, row.subject);
      if (!row.threadId) {
        for (const existing of rows.values()) {
          if (existing.key === key && existing.status === "pending") return { conflict: true };
        }
      }
      const id = `row-${++seq}`;
      rows.set(id, { id, key, attempted: false, status: "pending" });
      return { id };
    },
    markAttempted: async (id) => {
      const row = rows.get(id);
      if (!row || row.attempted) return false;
      row.attempted = true;
      return true;
    },
    markSent: async (id, gmail) => {
      const row = rows.get(id);
      if (!row) return false;
      row.status = "sent";
      row.messageId = gmail.messageId;
      return true;
    },
    markFailed: async (id) => {
      const row = rows.get(id);
      if (row) row.status = "failed";
    },
  };
  return { store, rows };
}

const draft = {
  userId: "user-1",
  to: "a@b.co",
  subject: "one question",
  bodyHtml: "<p>hi</p>",
  bodyText: "hi",
  leadId: null,
  templateId: null,
  threadId: null,
  trackingPixelId: null,
  sendingAccountId: null,
  allowDuplicate: false,
};

describe("a Gmail accept that cannot be stored is not retried", () => {
  it("calls the provider once and tells the caller not to send again", async () => {
    const { store } = memoryStore();
    let sends = 0;
    const mailbox = {
      send: async () => {
        sends += 1;
        return { ok: true as const, messageId: "gmail-1", threadId: null };
      },
    };
    const failingStore: OutboundStore = {
      ...store,
      markSent: async () => false,
    };
    const first = await deliverReserved(failingStore, mailbox, draft);
    expect(first.kind).toBe("accepted_unpersisted");
    if (first.kind === "accepted_unpersisted") expect(first.retryable).toBe(false);
    const second = await deliverReserved(failingStore, mailbox, draft);
    expect(second.kind).toBe("duplicate");
    expect(sends).toBe(1);
  });

  it("lets only one of two racing reservations reach the provider", async () => {
    const { store } = memoryStore();
    let sends = 0;
    const mailbox = {
      send: async () => {
        sends += 1;
        return { ok: true as const, messageId: `gmail-${sends}`, threadId: null };
      },
    };
    const results = await Promise.all([
      deliverReserved(store, mailbox, draft),
      deliverReserved(store, mailbox, { ...draft }),
    ]);
    expect(results.filter((result) => result.kind === "sent")).toHaveLength(1);
    expect(results.filter((result) => result.kind === "duplicate")).toHaveLength(1);
    expect(sends).toBe(1);
  });
});

describe("saved sequence copy is refused at the queue boundary", () => {
  it("blocks a company event that the research does not contain", () => {
    const blockers = queuedCopyBlockers(
      "quick note",
      "Saw you just launched a freight product last week.",
      "VP Sales\nlogistics",
    );
    expect(blockers.some((blocker) => blocker.startsWith("ungrounded_prospect_claim"))).toBe(true);
  });

  it("allows a note that stays on the role", () => {
    expect(queuedCopyBlockers(
      "quick note",
      "Most VP Sales roles in logistics lose the follow-up. Worth a look?",
      "VP Sales\nlogistics",
    )).toEqual([]);
  });
});

describe("a sweep page covers the whole set and never reads it all at once", () => {
  it("visits every index across one cycle and stays inside the page size", () => {
    const total = 100;
    const pageSize = 40;
    const seen = new Set<number>();
    const pages = Math.ceil(total / pageSize);
    for (let page = 0; page < pages; page++) {
      const slice = sweepSlice(total, pageSize, page * 60_000, 60_000);
      expect(slice.to - slice.from + 1).toBeLessThanOrEqual(pageSize);
      for (let i = slice.from; i <= slice.to; i++) seen.add(i);
    }
    expect(seen.size).toBe(total);
  });
});

describe("research prose has to use words that were actually read", () => {
  const page = "Acme builds route planning software for freight brokers in the midwest.";

  it("keeps a sentence whose words are on the page", () => {
    expect(claimSupportedByCorpus("Acme builds route planning software for freight brokers", page)).toBe(true);
  });

  it("drops a sentence that cites the page and says something else", () => {
    expect(claimSupportedByCorpus("Acme raised a series C and hired twelve account executives", page)).toBe(false);
  });

  it("drops a claim when nothing was read", () => {
    expect(claimSupportedByCorpus("Acme builds route planning software", "")).toBe(false);
  });
});

describe("the coach page reads the checked SSE body, including a split chunk", () => {
  it("assembles advice that arrives in pieces", async () => {
    const payload = `data: ${JSON.stringify({ choices: [{ delta: { content: "Use the two stalled deals." } }] })}\n\ndata: [DONE]\n\n`;
    const mid = Math.floor(payload.length / 2);
    const chunks = [payload.slice(0, mid), payload.slice(mid)];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    const seen: string[] = [];
    const full = await readCoachDeltaStream(stream, (text) => seen.push(text));
    expect(full).toBe("Use the two stalled deals.");
    expect(seen.at(-1)).toBe(full);
  });

  it("does not treat a JSON advice object as a coach message", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ advice: "Your close rate is 62%." })));
        controller.close();
      },
    });
    expect(await readCoachDeltaStream(stream)).toBe("");
  });
});

describe("credit debits from one balance cannot both succeed", () => {
  it("a locked meter applies one debit when the balance is 1", async () => {
    let credits = 1;
    let locked = Promise.resolve();
    const client = {
      rpc: async (_fn: string, args: Record<string, unknown>) => {
        const run = locked.then(async () => {
          const delta = Number(args.p_credit_delta);
          const gate = args.p_gate === true;
          if (gate && delta < 0 && credits + delta < 0) {
            return { data: { applied: false, reason: "insufficient", credits, daily: 0 }, error: null };
          }
          credits = Math.max(0, credits + delta);
          return { data: { applied: true, credits, daily: 0 }, error: null };
        });
        locked = run.then(() => undefined, () => undefined);
        return run;
      },
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => applySearchMeter(client, {
        userId: "user-1",
        creditDelta: -1,
        dailyDelta: 0,
        description: "Lead enrichment",
        gate: true,
      })),
    );
    expect(results.filter((result) => result.applied)).toHaveLength(1);
    expect(credits).toBe(0);
  });
});

const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";

describe("local postgres serializes the credit debit", () => {
  it("eight concurrent debits from a balance of 1 leave one credit spent", async () => {
    let sql: ReturnType<typeof postgres> | null = null;
    try {
      sql = postgres(PG_URL, { max: 8, connect_timeout: 2 });
      await sql`select 1`;
    } catch {
      if (sql) await sql.end({ timeout: 1 });
      // CI does not run Postgres. The local audit run does, and records it.
      return;
    }
    const migration = readFileSync("supabase/migrations/20261106053000_meter_and_send_guards.sql", "utf8");
    const fn = migration.slice(migration.indexOf("CREATE OR REPLACE FUNCTION public.apply_search_meter"), migration.indexOf("REVOKE ALL ON FUNCTION"));
    await sql.unsafe(`
      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role' $$;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      DROP TABLE IF EXISTS search_transactions;
      DROP TABLE IF EXISTS subscriptions;
      DROP TABLE IF EXISTS sent_emails;
      CREATE TABLE subscriptions (
        user_id uuid PRIMARY KEY,
        search_credits_remaining integer,
        daily_searches_used integer
      );
      CREATE TABLE search_transactions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        type text,
        amount integer,
        balance_after integer,
        description text
      );
      CREATE TABLE sent_emails (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL,
        to_email text NOT NULL,
        subject text NOT NULL,
        status text,
        enrollment_id uuid,
        sequence_step integer,
        gmail_thread_id text
      );
    `);
    await sql.unsafe(fn);
    await sql.unsafe(migration.slice(migration.indexOf("CREATE UNIQUE INDEX")));
    const userId = "11111111-1111-1111-1111-111111111111";
    await sql`INSERT INTO subscriptions (user_id, search_credits_remaining, daily_searches_used) VALUES (${userId}::uuid, 1, 0)`;
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        sql!`SELECT public.apply_search_meter(${userId}::uuid, -1, 0, 'contention', true, NULL) AS result`),
    );
    const applied = results.filter((row) => (row[0].result as { applied: boolean }).applied).length;
    const [balance] = await sql`SELECT search_credits_remaining FROM subscriptions WHERE user_id = ${userId}::uuid`;
    expect(applied).toBe(1);
    expect(balance.search_credits_remaining).toBe(0);

    const step = async () => sql!`
      INSERT INTO sent_emails (user_id, to_email, subject, status, enrollment_id, sequence_step)
      VALUES (${userId}::uuid, 'a@b.co', 'step', 'scheduled', '22222222-2222-2222-2222-222222222222'::uuid, 1)
    `;
    const queued = await Promise.allSettled([step(), step()]);
    expect(queued.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(queued.filter((item) => item.status === "rejected")).toHaveLength(1);
    await sql.end({ timeout: 2 });
  });
});
