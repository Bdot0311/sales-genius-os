/**
 * Simular Box, prepared and not connected.
 *
 * Verified 8 Nov 2026 from https://box.simular.ai/ (Accept: text/markdown),
 * https://box.simular.ai/install.md, https://box.simular.ai/docs/mcp.md, and
 * https://box.simular.ai/auth.md. Those pages were not a license to call the
 * service. This module does not open a socket, read credentials, or register
 * a tool. https://platform.simular.ai/ is a different product and is not used.
 *
 * What those pages do say:
 * - One hosted MCP server, https://mcp.box.simular.ai/mcp, Streamable HTTP.
 * - Sign-in is OAuth (authorization code + PKCE, scope `boxes`, resource
 *   pinned to that MCP URL) or a personal key sent as
 *   `Authorization: Bearer cb_...`. auth.md says there is no agent
 *   self-registration: every credential comes from a person with a Simular
 *   account.
 * - "One cloud Linux desktop per account. It sleeps when no one uses it and
 *   wakes when your AI connects." The computer can browse, click, type, read
 *   the screen, and run commands. MCP setup repeats "one box per account,
 *   with Chrome and a persistent shell."
 * - "The box itself is free. Its model calls use your account's daily
 *   credits." No credit amount, refill, or per-call price is on these pages.
 * - The installer configures developer clients. It does not provision a
 *   backend. install.md treats `shell` and `box_list` as signs that setup
 *   finished. That is not a published safe-tool schema.
 * - The OAuth page asks which boxes an app may use and for how long. That is
 *   an end-user approval step, not a multi-tenant isolation contract.
 *
 * `admitBoxAttempt` therefore stays closed. A caller that flips `enabled`
 * still gets the unverified-contract refusal. The later gates (tenant,
 * forbidden operation, replay, budget, concurrency, timeout) are reachable
 * only by passing a fully populated contract into `explainBoxGate`, which is
 * how the tests exercise them, and even that path returns `network: "none"`.
 */

import { budgetExhausted } from "./agent-budget.ts";
import { replayDecision } from "./mutation-replay.ts";
import { reconcileReceipts, type ToolReceipt } from "./run-receipts.ts";
import { fence } from "./untrusted.ts";

export const SIMULAR_BOX_MCP_URL = "https://mcp.box.simular.ai/mcp";

export const LIVE_BOX_CONTRACT = {
  pricingKnown: false,
  serverAuthIsolationKnown: false,
  tenantSessionIsolationKnown: false,
  toolAllowlistKnown: false,
} as const;

export type BoxContract = { [K in keyof typeof LIVE_BOX_CONTRACT]: boolean };

export const BOX_BLOCKERS = [
  "Official Box is one cloud Linux desktop per account, not a verified per-tenant backend.",
  "Daily credit amounts and per-call prices are not published. A free computer does not price the model calls.",
  "OAuth and personal keys belong to a person with a Simular account. Server-side tenant credential isolation is not specified, and there is no agent self-registration.",
  "No safe tool allowlist is published. The documented desktop can run a shell and drive a browser, which this app will not hand to a model.",
] as const;

export type BoxOperation = "read" | "shell" | "browser" | "send" | "submit" | "session";

export type BoxPriorStatus = "dispatching" | "completed" | "unknown" | "failed" | null;

export interface BoxGateInput {
  enabled: boolean;
  ownerId: string;
  tenantId: string;
  credentialOwnerId: string | null;
  sharedDesktop: boolean;
  operation: BoxOperation;
  priorStatus: BoxPriorStatus;
  spent: number;
  budget: number;
  inFlight: number;
  maxInFlight: number;
  remainingMs: number;
}

export interface BoxDecision {
  admit: false;
  reason: string;
  blockers: readonly string[];
  receipt: ToolReceipt;
  network: "none";
}

const FORBIDDEN: ReadonlySet<BoxOperation> = new Set(["shell", "browser", "send", "submit", "session"]);

function contractBlockers(contract: BoxContract): readonly string[] {
  if (
    contract.pricingKnown &&
    contract.serverAuthIsolationKnown &&
    contract.tenantSessionIsolationKnown &&
    contract.toolAllowlistKnown
  ) {
    return [];
  }
  return BOX_BLOCKERS;
}

function refuse(reason: string, blockers: readonly string[]): BoxDecision {
  return {
    admit: false,
    reason,
    blockers,
    network: "none",
    receipt: { toolName: "simular_box", status: "failed", detail: reason },
  };
}

/**
 * Gate order is the admission. Nothing in this function performs the work
 * the gate is about, so a refusal is decided before any Box call would be
 * billed. There is no Box call in this repository.
 */
export function explainBoxGate(input: BoxGateInput, contract: BoxContract = LIVE_BOX_CONTRACT): BoxDecision {
  const blockers = contractBlockers(contract);
  if (!input.enabled) return refuse("disabled", blockers);
  if (blockers.length > 0) return refuse("unverified_contract", blockers);

  if (!input.ownerId || input.ownerId !== input.tenantId) return refuse("tenant_mismatch", blockers);
  if (!input.credentialOwnerId || input.credentialOwnerId !== input.tenantId) {
    return refuse("credential_not_isolated", blockers);
  }
  if (input.sharedDesktop) return refuse("shared_desktop", blockers);
  if (FORBIDDEN.has(input.operation)) return refuse("forbidden_operation", blockers);

  if (input.priorStatus === "failed") return refuse("recorded_failure", blockers);
  if (input.priorStatus !== null && replayDecision(input.priorStatus) === "skip") {
    const reason = input.priorStatus === "unknown"
      ? "unknown_outcome"
      : input.priorStatus === "completed"
        ? "duplicate"
        : "already_dispatching";
    return refuse(reason, blockers);
  }

  if (budgetExhausted(input.spent, input.budget)) return refuse("budget", blockers);
  if (input.inFlight >= input.maxInFlight) return refuse("concurrency", blockers);
  if (input.remainingMs <= 0) return refuse("timeout", blockers);

  return refuse("live_session_not_implemented", blockers);
}

/** The only entry a caller should use. The live contract is not an argument. */
export function admitBoxAttempt(input: BoxGateInput): BoxDecision {
  return explainBoxGate(input, LIVE_BOX_CONTRACT);
}

export function collapseBoxReceipts(receipts: ToolReceipt[]): ToolReceipt[] {
  return reconcileReceipts(receipts, []);
}

/**
 * Desktop text is data, not an instruction and not a research sentence.
 * An evidence id is not accepted here: this module has no snapshot to bind.
 */
export function boxText(text: string): {
  trusted: false;
  fenced: string;
  claims: [];
  unknown: string;
} {
  return {
    trusted: false,
    fenced: fence("simular-box", text),
    claims: [],
    unknown: "Box desktop text is not an approved research sentence and is not evidence.",
  };
}
