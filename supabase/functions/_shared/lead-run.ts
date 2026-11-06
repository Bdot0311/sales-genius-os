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
}

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
    claim: async (userId, leadId, runId, phase, owner, leaseSeconds, maxAttempts) => {
      const { data } = await client.rpc("claim_agent_run_step", {
        p_user_id: userId,
        p_lead_id: leadId,
        p_run_id: runId,
        p_phase: phase,
        p_owner: owner,
        p_lease_seconds: leaseSeconds,
        p_max_attempts: maxAttempts,
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
  ids: { userId: string; leadId: string; runId: string; owner: string },
  phase: LeadPhase,
  effect: (ctx: PhaseContext) => Promise<Record<string, unknown> | void>,
  limits?: { leaseSeconds?: number; maxAttempts?: number },
): Promise<{ action: "ran" | "skipped" | "stopped"; payload: Record<string, unknown> | null; status: string }> {
  if (!store) {
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
  const effects: LeadPhase[] = [];
  let hold = false;
  const ids = { userId: input.userId, leadId: input.leadId, runId: input.runId, owner: input.owner };
  const limits = { leaseSeconds: input.leaseSeconds, maxAttempts: input.maxAttempts };

  for (const phase of LEAD_PHASES) {
    if ((phase === "hold" && !hold) || (phase === "send" && hold)) {
      const skipped = await runPhase(input.store, ids, phase, async () => ({ skipped: true }), limits);
      if (skipped.action === "stopped") return { effects, stopped: skipped.status, hold };
      continue;
    }
    const ran = await runPhase(input.store, ids, phase, async () => {
      if (phase === "score") {
        const scored = await input.effects.score();
        hold = scored.hold;
        return { hold: scored.hold };
      }
      return asPayload(await input.effects[phase]()) ?? {};
    }, limits);
    if (ran.action === "skipped" && phase === "score" && ran.payload?.hold === true) hold = true;
    if (ran.status === "left_open") {
      effects.push(phase);
      return { effects, stopped: "left_open", hold };
    }
    if (ran.action === "stopped") return { effects, stopped: ran.status, hold };
    if (ran.action === "ran") effects.push(phase);
  }
  return { effects, stopped: null, hold };
}
