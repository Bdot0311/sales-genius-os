import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { RUBRIC_SYSTEM_PROMPT } from "../../supabase/functions/check-email-rubric/prompt";
import { outboundGateFindings } from "../../supabase/functions/_shared/quality-gate";
import { evaluateSend, shouldExecuteStep } from "../../supabase/functions/_shared/outbound-verdict";
import { contentHash, rubricPromptHash, sha256Hex } from "../../supabase/functions/_shared/prompt-versions";
import { guardRunSummary, type ToolReceipt } from "../../supabase/functions/_shared/run-receipts";

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
});

const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";

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
