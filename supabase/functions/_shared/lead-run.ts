/**
 * One lead's research, draft, score, hold, and send, in that order, on a
 * persisted step store.
 *
 * A completed step is not run again. A claim that is not `claimed` does not
 * run its effect. The effect runs only while this worker still owns an
 * unexpired lease that has not been cancelled. deliverReserved stays outside
 * this module, on the send itself.
 */

import { shouldExecuteStep } from "./outbound-verdict.ts";

export type LeadPhase = "research" | "draft" | "score" | "hold" | "send";

export const LEAD_PHASES: LeadPhase[] = ["research", "draft", "score", "hold", "send"];

export interface StepClaim {
  stepId: string;
  status: string;
  attemptCount: number;
  payload: Record<string, unknown> | null;
}

export interface StepStore {
  claim(
    userId: string,
    leadId: string,
    runId: string,
    phase: LeadPhase,
    owner: string,
    leaseSeconds: number,
    maxAttempts: number,
    subjectKey?: string,
  ): Promise<StepClaim>;
  stillOwned(stepId: string, owner: string): Promise<boolean>;
  complete(stepId: string, owner: string, payload: Record<string, unknown> | null): Promise<boolean>;
}

/** Re-check this immediately before a provider call. False after cancel, expiry, or a lost lease. */
export interface PhaseContext {
  owned: () => Promise<boolean>;
}

export interface LeadEffects {
  research: () => Promise<Record<string, unknown> | void>;
  draft: () => Promise<Record<string, unknown> | void>;
  /** Return `{ hold: true }` to save a draft and skip the provider send. */
  score: () => Promise<{ hold: boolean }>;
  hold: () => Promise<Record<string, unknown> | void>;
  send: () => Promise<{ ok: boolean; done?: boolean }>;
}

export interface AdvanceResult {
  effects: LeadPhase[];
  stopped: string | null;
  hold: boolean;
  payloads: Partial<Record<LeadPhase, Record<string, unknown> | null>>;
}

/** Reply work uses draft, score, hold, and send. It does not research. */
export const REPLY_PHASES: LeadPhase[] = ["draft", "score", "hold", "send"];

export function rpcStepStore(client: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> }): StepStore {
  const row = (data: unknown): StepClaim => {
    const item = Array.isArray(data) ? data[0] : data;
    const record = (item ?? {}) as { step_id?: string; step_status?: string; attempt_count?: number; payload?: Record<string, unknown> | null };
    return {
      stepId: String(record.step_id ?? ""),
      status: String(record.step_status ?? "stopped"),
      attemptCount: Number(record.attempt_count ?? 0),
      payload: record.payload ?? null,
    };
  };
  return {
    claim: async (userId, leadId, runId, phase, owner, leaseSeconds, maxAttempts, subjectKey) => {
      const { data } = await client.rpc("claim_agent_run_step", {
        p_user_id: userId,
        p_lead_id: leadId,
        p_run_id: runId,
        p_phase: phase,
        p_owner: owner,
        p_lease_seconds: leaseSeconds,
        p_max_attempts: maxAttempts,
        p_subject_key: subjectKey ?? leadId,
      });
      return row(data);
    },
    stillOwned: async (stepId, owner) => {
      const { data } = await client.rpc("agent_step_owned", { p_step_id: stepId, p_owner: owner });
      return data === true;
    },
    complete: async (stepId, owner, payload) => {
      const { data } = await client.rpc("complete_agent_run_step", {
        p_step_id: stepId,
        p_owner: owner,
        p_payload: payload,
      });
      return data === true;
    },
  };
}

function asPayload(value: Record<string, unknown> | void | null): Record<string, unknown> | null {
  if (value && typeof value === "object") return value;
  return null;
}

/**
 * Run one phase.
 *
 * A null store means this process has no step table: the effect runs in
 * memory, the status is `in_memory`, and the caller must not call that run
 * durable. `done: false` leaves the lease open so a failed send can be
 * retried until the attempt cap. It does not complete the step.
 */
export async function runPhase(
  store: StepStore | null,
  ids: { userId: string; leadId: string; runId: string; owner: string; subjectKey?: string; requireDurable?: boolean },
  phase: LeadPhase,
  effect: (ctx: PhaseContext) => Promise<Record<string, unknown> | void>,
  limits?: { leaseSeconds?: number; maxAttempts?: number; requireDurable?: boolean },
): Promise<{ action: "ran" | "skipped" | "stopped"; payload: Record<string, unknown> | null; status: string }> {
  if (!store) {
    if (limits?.requireDurable || ids.requireDurable) {
      return { action: "stopped", payload: null, status: "durable_unavailable" };
    }
    const payload = asPayload(await effect({ owned: async () => true }));
    return { action: "ran", payload, status: "in_memory" };
  }
  const claim = await store.claim(
    ids.userId,
    ids.leadId,
    ids.runId,
    phase,
    ids.owner,
    limits?.leaseSeconds ?? 120,
    limits?.maxAttempts ?? 3,
    ids.subjectKey ?? ids.leadId,
  );
  if (claim.status === "done") return { action: "skipped", payload: claim.payload, status: "done" };
  if (!shouldExecuteStep(claim.status)) return { action: "stopped", payload: claim.payload, status: claim.status };
  const owned = () => store.stillOwned(claim.stepId, ids.owner);
  if (!await owned()) return { action: "stopped", payload: null, status: "ownership_lost" };
  const payload = asPayload(await effect({ owned }));
  if (payload && payload.done === false) return { action: "ran", payload, status: "left_open" };
  const closed = await store.complete(claim.stepId, ids.owner, payload);
  if (!closed) return { action: "stopped", payload, status: "ownership_lost" };
  return { action: "ran", payload, status: "done" };
}

export async function advanceLead(input: {
  store: StepStore;
  userId: string;
  leadId: string;
  runId: string;
  owner: string;
  leaseSeconds?: number;
  maxAttempts?: number;
  effects: LeadEffects;
}): Promise<AdvanceResult> {
  return walkPhases({
    phases: LEAD_PHASES,
    store: input.store,
    ids: { userId: input.userId, leadId: input.leadId, runId: input.runId, owner: input.owner },
    limits: { leaseSeconds: input.leaseSeconds, maxAttempts: input.maxAttempts },
    run: async (phase) => {
      if (phase === "score") {
        const scored = await input.effects.score();
        return { hold: scored.hold };
      }
      return asPayload(await input.effects[phase]()) ?? {};
    },
  });
}

export interface ReplyEffects {
  draft: () => Promise<Record<string, unknown> | void>;
  score: () => Promise<{ hold: boolean; approval?: boolean; body?: string }>;
  hold: (score: Record<string, unknown> | null) => Promise<Record<string, unknown> | void>;
  send: (ctx: PhaseContext, prior: AdvanceResult["payloads"]) => Promise<{ ok: boolean; done?: boolean; submitted?: boolean }>;
}

/**
 * Draft, score, hold, and send for one reply. Research is not a reply phase.
 * `subjectKey` is the sent-email id, so a reply does not reuse the lead's
 * first-touch send step. `requireDurable` refuses to run when there is no store.
 * A cancel or a lost lease after `submitted: true` does not recall the provider.
 */
export async function advanceReply(input: {
  store: StepStore | null;
  userId: string;
  leadId: string;
  subjectKey: string;
  runId: string;
  owner: string;
  requireDurable?: boolean;
  leaseSeconds?: number;
  maxAttempts?: number;
  effects: ReplyEffects;
}): Promise<AdvanceResult> {
  return walkPhases({
    phases: REPLY_PHASES,
    store: input.store,
    ids: {
      userId: input.userId,
      leadId: input.leadId,
      subjectKey: input.subjectKey,
      runId: input.runId,
      owner: input.owner,
    },
    limits: {
      leaseSeconds: input.leaseSeconds,
      maxAttempts: input.maxAttempts,
      requireDurable: input.requireDurable,
    },
    run: async (phase, ctx, prior) => {
      if (phase === "score") {
        const scored = await input.effects.score();
        return { hold: scored.hold, approval: scored.approval === true, body: scored.body ?? "" };
      }
      if (phase === "send") return input.effects.send(ctx, prior);
      if (phase === "draft") return asPayload(await input.effects.draft()) ?? {};
      return asPayload(await input.effects.hold(prior.score ?? null)) ?? {};
    },
  });
}

async function walkPhases(input: {
  phases: LeadPhase[];
  store: StepStore | null;
  ids: { userId: string; leadId: string; runId: string; owner: string; subjectKey?: string };
  limits: { leaseSeconds?: number; maxAttempts?: number; requireDurable?: boolean };
  run: (phase: LeadPhase, ctx: PhaseContext, prior: AdvanceResult["payloads"]) => Promise<Record<string, unknown> | void>;
}): Promise<AdvanceResult> {
  const effects: LeadPhase[] = [];
  const payloads: AdvanceResult["payloads"] = {};
  let hold = false;
  for (const phase of input.phases) {
    if ((phase === "hold" && !hold) || (phase === "send" && hold)) {
      const skipped = await runPhase(input.store, input.ids, phase, async () => ({ skipped: true }), input.limits);
      payloads[phase] = skipped.payload;
      if (skipped.action === "stopped") return { effects, stopped: skipped.status, hold, payloads };
      continue;
    }
    const ran = await runPhase(input.store, input.ids, phase, async (ctx) => input.run(phase, ctx, payloads), input.limits);
    payloads[phase] = ran.payload;
    if (ran.action === "skipped" && phase === "score" && ran.payload?.hold === true) hold = true;
    if (ran.action === "ran" && phase === "score" && ran.payload?.hold === true) hold = true;
    if (ran.status === "left_open") {
      effects.push(phase);
      return { effects, stopped: "left_open", hold, payloads };
    }
    if (ran.action === "stopped") return { effects, stopped: ran.status, hold, payloads };
    if (ran.action === "ran") effects.push(phase);
  }
  return { effects, stopped: null, hold, payloads };
}
