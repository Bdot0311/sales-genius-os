import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { RUBRIC_SYSTEM_PROMPT } from "../../supabase/functions/check-email-rubric/prompt";
import { outboundGateFindings } from "../../supabase/functions/_shared/quality-gate";
import { advanceLead, runPhase, type StepStore } from "../../supabase/functions/_shared/lead-run";
import { evaluateSend, shouldExecuteStep } from "../../supabase/functions/_shared/outbound-verdict";
import { contentHash, rubricPromptHash, sha256Hex } from "../../supabase/functions/_shared/prompt-versions";
import { buildAgentRunSummary, classifyProviderSend, guardRunSummary, type ToolReceipt } from "../../supabase/functions/_shared/run-receipts";

const USUALLY = "Freight brokers usually lose the second touch. The handoff after the first reply is where it dies.";
const QUESTION = "How does follow-up work on your team after the first reply?";

describe("frozen fixture replay, no model", () => {
  it("rejects the unsupported usually sentence", () => {
    const findings = outboundGateFindings("follow-up", USUALLY, "");
    expect(findings.map((f) => f.rule)).toContain("ungrounded_prospect_claim");
  });

  it("does not reject a question that asserts no rate", () => {
    expect(outboundGateFindings("follow-up", QUESTION, "").map((f) => f.rule))
      .not.toContain("ungrounded_prospect_claim");
  });
});

describe("a changed body cannot reuse a passing verdict", () => {
  it("refuses the canary when the hash no longer matches", async () => {
    const oldHash = await contentHash("follow-up", QUESTION);
    const newHash = await contentHash("follow-up", USUALLY);
    const decision = evaluateSend({
      liveBlocked: false,
      contentHash: newHash,
      promptHash: "prompt-a",
      rubricPromptHash: "rubric-a",
      stored: {
        contentHash: oldHash,
        gateStatus: "clear",
        promptHash: "prompt-a",
        rubricPromptHash: "rubric-a",
      },
      canary: true,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe("verdict_missing_or_stale");
  });

  it("keeps the live gate on when the canary is off", () => {
    const decision = evaluateSend({
      liveBlocked: true,
      contentHash: "h",
      promptHash: "p",
      rubricPromptHash: "r",
      stored: null,
      canary: false,
    });
    expect(decision.allow).toBe(false);
    expect(decision.reason).toBe("live_gate");
  });

  it("distinguishes the same body under two prompt hashes", async () => {
    const bodyHash = await contentHash("follow-up", QUESTION);
    const first = await sha256Hex(RUBRIC_SYSTEM_PROMPT);
    const second = await sha256Hex(`${RUBRIC_SYSTEM_PROMPT}\nextra`);
    expect(first).not.toBe(second);
    const a = evaluateSend({
      liveBlocked: false,
      contentHash: bodyHash,
      promptHash: "gate",
      rubricPromptHash: first,
      stored: { contentHash: bodyHash, gateStatus: "clear", promptHash: "gate", rubricPromptHash: second },
      canary: true,
    });
    expect(a.allow).toBe(false);
    expect(a.reason).toBe("prompt_version_mismatch");
    expect(await rubricPromptHash()).toBe(first);
  });
});

describe("a receipt is not a completed send", () => {
  it("corrects a summary that says sent when the provider accept was not stored", () => {
    const receipts: ToolReceipt[] = [{
      toolName: "send_outreach",
      status: "provider_accepted_unpersisted",
      detail: "gmail accepted, row missing",
    }];
    const text = guardRunSummary("I sent the email.", receipts);
    expect(text).toContain("Correction:");
    expect(text).toContain("nothing was actually sent");
  });

  it("does not correct a summary backed by an ok receipt", () => {
    const text = guardRunSummary("I sent the email.", [{ toolName: "send_outreach", status: "ok" }]);
    expect(text).not.toContain("Correction:");
  });

  it("does not describe approval, an attempt, or an unpersisted accept as delivered", () => {
    const base = {
      agentLabel: "Agent (full cycle)",
      approvalMode: false,
      leadsFound: 1,
      outreachDrafted: 0,
      threadsChecked: 0,
      pendingApprovals: 0,
    };
    for (const status of ["approved", "attempted", "provider_accepted_unpersisted"] as const) {
      const text = buildAgentRunSummary({
        ...base,
        receipts: [{ toolName: "send_outreach", status, detail: "a@b.co" }],
      });
      expect(text).toContain("0 first-touch email(s) sent");
      expect(text).not.toMatch(/\b1 first-touch email\(s\) sent/);
    }
    const approved = buildAgentRunSummary({
      ...base,
      approvalMode: true,
      outreachDrafted: 1,
      receipts: [{ toolName: "send_outreach", status: "approved" }],
    });
    expect(approved).toContain("waiting for your approval");
    expect(approved).not.toContain("email(s) sent");
    expect(classifyProviderSend({ ok: true, code: "accepted_unpersisted", error: "not saved" }))
      .toBe("provider_accepted_unpersisted");
    expect(classifyProviderSend({ ok: true })).toBe("ok");
    expect(classifyProviderSend({ ok: false })).toBe("failed");
  });
});

describe("production wiring", () => {
  const RUN = readFileSync("supabase/functions/agent-run/index.ts", "utf8");
  const SEND = readFileSync("supabase/functions/send-email/index.ts", "utf8");
  const MIGRATION = readFileSync("supabase/migrations/20261106140000_outbound_verdicts_and_run_steps.sql", "utf8");

  it("resumes a finished research step from its payload instead of calling research again", () => {
    const skipped = RUN.slice(RUN.indexOf('if (researchPhase.action === "skipped")'), RUN.indexOf("const leadResearchBlock"));
    expect(skipped).not.toContain("researchBlockForLead");
    expect(RUN).toContain('rpc("open_outbound_run"');
    expect(RUN).toContain('rpc("close_outbound_run"');
    expect(RUN).toContain('rpc("cancel_agent_run"');
    expect(RUN).toContain("replyExecution: \"in_memory\"");
  });

  it("stores the scorer result for the signed plain text and still reserves the send", () => {
    const signed = SEND.indexOf("appendSignatureToBody");
    const scored = SEND.indexOf("scoreEmailReport");
    const hashed = SEND.indexOf("contentHash(String(subject");
    expect(signed).toBeGreaterThan(-1);
    expect(scored).toBeGreaterThan(signed);
    expect(hashed).toBeGreaterThan(signed);
    expect(SEND).toContain("p_rubric_availability: rubricReport.availability");
    expect(SEND).toContain("deliverReserved(");
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION %s FROM authenticated");
    expect(MIGRATION).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
  });
});

const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";

describe("the lead runner skips completed phases and will not send twice", () => {
  function memoryStore(): StepStore {
    const rows = new Map<string, { status: string; attempt: number; payload: Record<string, unknown> | null; owner: string | null; exp: number }>();
    return {
      claim: async (userId, leadId, runId, phase, owner, leaseSeconds, maxAttempts) => {
        const key = `${userId}:${leadId}:${runId}:${phase}`;
        const row = rows.get(key) ?? { status: "open", attempt: 0, payload: null, owner: null, exp: 0 };
        if (row.status === "done" || row.status === "cancelled") {
          return { stepId: key, status: row.status, attemptCount: row.attempt, payload: row.payload };
        }
        if (row.status === "leased" && row.exp > Date.now() && row.owner !== owner) {
          return { stepId: key, status: "busy", attemptCount: row.attempt, payload: row.payload };
        }
        if (row.attempt >= maxAttempts) {
          return { stepId: key, status: "exhausted", attemptCount: row.attempt, payload: row.payload };
        }
        row.attempt += 1;
        row.status = "leased";
        row.owner = owner;
        row.exp = Date.now() + leaseSeconds * 1000;
        rows.set(key, row);
        return { stepId: key, status: "claimed", attemptCount: row.attempt, payload: row.payload };
      },
      stillOwned: async (stepId, owner) => {
        const row = rows.get(stepId);
        return !!row && row.status === "leased" && row.owner === owner && row.exp > Date.now();
      },
      complete: async (stepId, owner, payload) => {
        const row = rows.get(stepId);
        if (!row || row.owner !== owner || row.status !== "leased") return false;
        row.status = "done";
        row.payload = payload;
        row.owner = null;
        return true;
      },
    };
  }

  it("does not replay research or send after they are done", async () => {
    const store = memoryStore();
    const calls = { research: 0, send: 0 };
    const effects = () => ({
      research: async () => { calls.research += 1; },
      draft: async () => {},
      score: async () => ({ hold: false }),
      hold: async () => {},
      send: async () => { calls.send += 1; return { ok: true }; },
    });
    const first = await advanceLead({
      store, userId: "u", leadId: "l", runId: "r", owner: "a", effects: effects(),
    });
    const second = await advanceLead({
      store, userId: "u", leadId: "l", runId: "r", owner: "b", effects: effects(),
    });
    expect(first.effects).toEqual(["research", "draft", "score", "send"]);
    expect(second.effects).toEqual([]);
    expect(calls).toEqual({ research: 1, send: 1 });
    expect(second.stopped).toBeNull();
  });

  it("does not send when the score said hold", async () => {
    const calls = { send: 0, hold: 0 };
    const result = await advanceLead({
      store: memoryStore(),
      userId: "u", leadId: "l", runId: "r", owner: "a",
      effects: {
        research: async () => {},
        draft: async () => {},
        score: async () => ({ hold: true }),
        hold: async () => { calls.hold += 1; },
        send: async () => { calls.send += 1; return { ok: true }; },
      },
    });
    expect(calls).toEqual({ send: 0, hold: 1 });
    expect(result.hold).toBe(true);
  });
});

type Pg = ReturnType<typeof postgres>;

function pgStore(sql: Pg): StepStore {
  return {
    claim: async (userId, leadId, runId, phase, owner, leaseSeconds, maxAttempts) => {
      const rows = await sql`
        SELECT * FROM public.claim_agent_run_step(
          ${userId}::uuid, ${leadId}::uuid, ${runId}::uuid, ${phase}, ${owner}, ${leaseSeconds}, ${maxAttempts}
        )`;
      const row = rows[0];
      return {
        stepId: String(row.step_id),
        status: String(row.step_status),
        attemptCount: Number(row.attempt_count),
        payload: (row.payload ?? null) as Record<string, unknown> | null,
      };
    },
    stillOwned: async (stepId, owner) => {
      const rows = await sql`SELECT public.agent_step_owned(${stepId}::uuid, ${owner}) AS ok`;
      return rows[0].ok === true;
    },
    complete: async (stepId, owner, payload) => {
      const rows = await sql`
        SELECT public.complete_agent_run_step(${stepId}::uuid, ${owner}, ${payload ? sql.json(JSON.parse(JSON.stringify(payload))) : null}) AS ok`;
      return rows[0].ok === true;
    },
  };
}

async function withPg(run: (sql: Pg) => Promise<void>) {
  let sql: Pg | null = null;
  try {
    sql = postgres(PG_URL, { max: 4, connect_timeout: 2 });
    await sql`select 1`;
  } catch (err) {
    if (sql) await sql.end({ timeout: 1 });
    if (process.env.AUDIT_PG_REQUIRED === "1") {
      throw new Error(`AUDIT_PG_REQUIRED is set but ${PG_URL} is not reachable: ${err instanceof Error ? err.message : err}`);
    }
    return;
  }
  try {
    await sql.unsafe(readFileSync("supabase/migrations/20261106140000_outbound_verdicts_and_run_steps.sql", "utf8"));
    await run(sql);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

describe("advanceLead on postgres resumes, fences, and does not send twice", () => {
  it("does not replay a completed research step or send while another worker holds the lease", async () => {
    await withPg(async (sql) => {
      const store = pgStore(sql);
      const userId = crypto.randomUUID();
      const leadId = crypto.randomUUID();
      const runId = crypto.randomUUID();
      let research = 0;
      let sends = 0;
      const effects = () => ({
        research: async () => { research += 1; },
        draft: async () => {},
        score: async () => ({ hold: false }),
        hold: async () => {},
        send: async () => {
          sends += 1;
          if (sends === 1) return { ok: false, done: false as const };
          return { ok: true };
        },
      });
      const first = await advanceLead({ store, userId, leadId, runId, owner: "a", effects: effects() });
      expect(first.stopped).toBe("left_open");
      expect(research).toBe(1);
      expect(sends).toBe(1);
      const overlapped = await advanceLead({ store, userId, leadId, runId, owner: "b", effects: effects() });
      expect(overlapped.stopped).toBe("busy");
      expect(research).toBe(1);
      expect(sends).toBe(1);
      await sql`UPDATE public.outbound_run_steps SET lease_expires_at = now() - interval '1 minute' WHERE run_id = ${runId}::uuid AND phase = 'send'`;
      const resumed = await advanceLead({ store, userId, leadId, runId, owner: "c", effects: effects() });
      expect(resumed.stopped).toBeNull();
      expect(research).toBe(1);
      expect(sends).toBe(2);
      const again = await advanceLead({ store, userId, leadId, runId, owner: "d", effects: effects() });
      expect(again.effects).toEqual([]);
      expect(sends).toBe(2);
    });
  });

  it("lets one of two overlapping workers send", async () => {
    await withPg(async (sql) => {
      const store = pgStore(sql);
      const userId = crypto.randomUUID();
      const leadId = crypto.randomUUID();
      const runId = crypto.randomUUID();
      let sends = 0;
      const effects = () => ({
        research: async () => {},
        draft: async () => {},
        score: async () => ({ hold: false }),
        hold: async () => {},
        send: async () => { sends += 1; return { ok: true }; },
      });
      await Promise.all([
        advanceLead({ store, userId, leadId, runId, owner: "a", effects: effects() }),
        advanceLead({ store, userId, leadId, runId, owner: "b", effects: effects() }),
      ]);
      expect(sends).toBe(1);
    });
  });

  it("does not send after the lease expires or the run is cancelled, and stops at the attempt cap", async () => {
    await withPg(async (sql) => {
      const store = pgStore(sql);
      const userId = crypto.randomUUID();
      const leadId = crypto.randomUUID();
      const runId = crypto.randomUUID();
      const ids = { userId, leadId, runId, owner: "a" };
      let sends = 0;
      const expired = await runPhase(store, ids, "send", async (ctx) => {
        await sql`UPDATE public.outbound_run_steps SET lease_expires_at = now() - interval '1 minute' WHERE run_id = ${runId}::uuid AND phase = 'send'`;
        if (!await ctx.owned()) return { ok: false, done: false };
        sends += 1;
        return { ok: true };
      });
      expect(expired.status).toBe("left_open");
      expect(sends).toBe(0);

      const claimed = await store.claim(userId, leadId, runId, "send", "a", 30, 3);
      const finished = await sql`SELECT public.complete_agent_run_step(${claimed.stepId}::uuid, 'stale-owner', null) AS ok`;
      expect(finished[0].ok).toBe(false);
      await sql`UPDATE public.outbound_run_steps SET lease_expires_at = now() - interval '1 minute' WHERE id = ${claimed.stepId}::uuid`;
      const stale = await sql`SELECT public.complete_agent_run_step(${claimed.stepId}::uuid, 'a', null) AS ok`;
      expect(stale[0].ok).toBe(false);

      const cancelRun = crypto.randomUUID();
      let drafted = 0;
      await runPhase(store, { userId, leadId, runId: cancelRun, owner: "a" }, "send", async (ctx) => {
        await sql`SELECT public.cancel_agent_run(${userId}::uuid, ${cancelRun}::uuid)`;
        if (!await ctx.owned()) return { ok: false, done: false };
        sends += 1;
        return { ok: true };
      });
      const afterCancel = await runPhase(store, { userId, leadId, runId: cancelRun, owner: "b" }, "draft", async () => {
        drafted += 1;
      });
      expect(afterCancel.status).toBe("cancelled");
      expect(drafted).toBe(0);
      expect(sends).toBe(0);

      const limited = crypto.randomUUID();
      let attempts = 0;
      for (let i = 0; i < 3; i++) {
        const step = await runPhase(store, { userId, leadId, runId: limited, owner: "a" }, "send", async () => {
          attempts += 1;
          return { ok: false, done: false };
        }, { maxAttempts: 3, leaseSeconds: 30 });
        expect(step.status).toBe("left_open");
      }
      const exhausted = await runPhase(store, { userId, leadId, runId: limited, owner: "a" }, "send", async () => {
        attempts += 1;
        return { ok: true };
      }, { maxAttempts: 3, leaseSeconds: 30 });
      expect(exhausted.status).toBe("exhausted");
      expect(shouldExecuteStep(exhausted.status)).toBe(false);
      expect(attempts).toBe(3);
    });
  });

  it("gives overlapping recoveries the same run, and a cancel lets the next call start a new one", async () => {
    await withPg(async (sql) => {
      const userId = crypto.randomUUID();
      const [first, second] = await Promise.all([
        sql`SELECT public.open_outbound_run(${userId}::uuid) AS id`,
        sql`SELECT public.open_outbound_run(${userId}::uuid) AS id`,
      ]);
      expect(first[0].id).toBe(second[0].id);
      const otherUser = crypto.randomUUID();
      const [other] = await sql`SELECT public.open_outbound_run(${otherUser}::uuid) AS id`;
      expect(other.id).not.toBe(first[0].id);
      await sql`SELECT public.cancel_agent_run(${userId}::uuid, ${first[0].id}::uuid)`;
      const [reopened] = await sql`SELECT public.open_outbound_run(${userId}::uuid) AS id`;
      expect(reopened.id).not.toBe(first[0].id);
      const grants = await sql`
        SELECT grantee FROM information_schema.routine_privileges
         WHERE routine_name = 'claim_agent_run_step' AND grantee = 'PUBLIC'`;
      expect(grants).toEqual([]);
    });
  });
});

describe("run steps lease, resume, and do not send twice", () => {
  it("one of two workers claims, an expired lease resumes, a done step does not run again", async () => {
    let sql: ReturnType<typeof postgres> | null = null;
    try {
      sql = postgres(PG_URL, { max: 4, connect_timeout: 2 });
      await sql`select 1`;
    } catch (err) {
      if (sql) await sql.end({ timeout: 1 });
      if (process.env.AUDIT_PG_REQUIRED === "1") {
        throw new Error(`AUDIT_PG_REQUIRED is set but ${PG_URL} is not reachable: ${err instanceof Error ? err.message : err}`);
      }
      return;
    }
    const migration = readFileSync("supabase/migrations/20261106140000_outbound_verdicts_and_run_steps.sql", "utf8");
    await sql.unsafe(migration);
    const user = crypto.randomUUID();
    const lead = crypto.randomUUID();
    const run = crypto.randomUUID();
    const claim = (owner: string) => sql!`
      SELECT * FROM public.claim_agent_run_step(
        ${user}::uuid, ${lead}::uuid, ${run}::uuid, 'send', ${owner}, 30, 3
      )`;
    const [first, second] = await Promise.all([claim("worker-a"), claim("worker-b")]);
    const statuses = [first[0].step_status, second[0].step_status].sort();
    expect(statuses).toEqual(["busy", "claimed"]);
    const winner = first[0].step_status === "claimed" ? first[0] : second[0];
    expect(shouldExecuteStep(winner.step_status)).toBe(true);
    expect(shouldExecuteStep("busy")).toBe(false);

    await sql`UPDATE public.outbound_run_steps SET lease_expires_at = now() - interval '1 minute' WHERE id = ${winner.step_id}::uuid`;
    const [resumed] = await claim("worker-c");
    expect(resumed.step_status).toBe("claimed");
    expect(Number(resumed.attempt_count)).toBe(2);
    await sql`SELECT public.complete_agent_run_step(${resumed.step_id}::uuid, 'worker-c')`;
    const [again] = await claim("worker-d");
    expect(again.step_status).toBe("done");
    expect(shouldExecuteStep(again.step_status)).toBe(false);

    const run2 = crypto.randomUUID();
    const [open] = await sql`
      SELECT * FROM public.claim_agent_run_step(
        ${user}::uuid, ${lead}::uuid, ${run2}::uuid, 'score', 'worker-a', 30, 3
      )`;
    expect(open.step_status).toBe("claimed");
    await sql`SELECT public.cancel_agent_run(${user}::uuid, ${run2}::uuid)`;
    const [cancelled] = await sql`
      SELECT * FROM public.claim_agent_run_step(
        ${user}::uuid, ${lead}::uuid, ${run2}::uuid, 'score', 'worker-b', 30, 3
      )`;
    expect(cancelled.step_status).toBe("cancelled");
    expect(shouldExecuteStep(cancelled.step_status)).toBe(false);

    const hash = await contentHash("follow-up", QUESTION);
    const other = await sha256Hex("other-prompt");
    const rubric = await rubricPromptHash();
    await sql`SELECT public.record_outbound_verdict(
      ${user}::uuid, ${lead}::uuid, ${hash}, 'follow-up', ${QUESTION}, '[]'::jsonb,
      'unavailable', NULL, 'gate-a', ${rubric}, 'clear', true, false
    )`;
    await sql`SELECT public.record_outbound_verdict(
      ${user}::uuid, ${lead}::uuid, ${hash}, 'follow-up', ${QUESTION}, '[]'::jsonb,
      'unavailable', NULL, 'gate-b', ${other}, 'clear', true, false
    )`;
    const rows = await sql`
      SELECT prompt_hash, rubric_prompt_hash FROM public.outbound_verdicts
       WHERE user_id = ${user}::uuid AND content_hash = ${hash}
       ORDER BY created_at`;
    expect(rows).toHaveLength(2);
    expect(rows[0].prompt_hash).not.toBe(rows[1].prompt_hash);
    expect(rows[0].rubric_prompt_hash).not.toBe(rows[1].rubric_prompt_hash);
    await sql.end({ timeout: 2 });
  });
});
