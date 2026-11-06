/**
 * Tool receipts for an autonomous run, and the summary those receipts allow.
 *
 * A queued approval, a failed attempt, and a provider accept that was not
 * stored are not completed sends. claim-check already says that for chat.
 * This applies the same rules to the run summary.
 */

import { correctionFor, unbackedClaims, type ToolEventLike } from "./claim-check.ts";

export type ReceiptStatus =
  | "requested"
  | "approved"
  | "attempted"
  | "failed"
  | "provider_accepted_unpersisted"
  | "ok";

export interface ToolReceipt {
  toolName: string;
  status: ReceiptStatus;
  detail?: string;
}

export function receiptToEvent(receipt: ToolReceipt): ToolEventLike {
  return {
    name: receipt.toolName,
    status: receipt.status === "ok" ? "ok" : receipt.status,
    label: receipt.status === "approved" ? "Waiting for your approval" : undefined,
    detail: receipt.detail,
  };
}

/**
 * The summary plus a correction when it claims a send the receipts do not back.
 * The original sentence is kept. The correction is appended.
 */
export function guardRunSummary(summary: string, receipts: ToolReceipt[]): string {
  const correction = correctionFor(unbackedClaims(summary, receipts.map(receiptToEvent)));
  if (!correction) return summary;
  return `${summary}\n${correction}`;
}

/**
 * What the provider response actually was.
 *
 * `ok` is the only status that may be described as delivered. Approval,
 * an attempt, a failure, and a provider accept that was not stored are not.
 */
export function classifyProviderSend(input: { ok: boolean; error?: unknown; code?: unknown }): ReceiptStatus {
  if (input.code === "accepted_unpersisted") return "provider_accepted_unpersisted";
  if (!input.ok || input.error) return "failed";
  return "ok";
}

export interface AgentRunSummaryInput {
  agentLabel: string;
  approvalMode: boolean;
  leadsFound: number;
  outreachDrafted: number;
  threadsChecked: number;
  pendingApprovals: number;
  receipts: ToolReceipt[];
}

/**
 * User-visible summary. Delivery counts come from `ok` receipts only.
 * A counter, an approval, an attempt, or an unpersisted accept cannot raise them.
 */
export function buildAgentRunSummary(input: AgentRunSummaryInput): string {
  const delivered = (toolName: string) =>
    input.receipts.filter((receipt) => receipt.toolName === toolName && receipt.status === "ok").length;
  const count = (status: ReceiptStatus) => input.receipts.filter((receipt) => receipt.status === status).length;
  const waiting = count("approved");
  const unpersisted = count("provider_accepted_unpersisted");
  const attempted = count("attempted");
  const failed = count("failed");
  const notes = [
    waiting > 0 ? `${waiting} waiting for approval, which is not delivery` : "",
    unpersisted > 0 ? `${unpersisted} accepted by the provider but not saved, and not counted as delivered` : "",
    attempted > 0 ? `${attempted} attempted and not delivered` : "",
    failed > 0 ? `${failed} failed` : "",
  ].filter(Boolean);
  const prose = input.approvalMode
    ? `${input.agentLabel} finished in approval mode — ${input.leadsFound} new lead(s) found, ${input.outreachDrafted} first-touch draft(s) created, ${input.threadsChecked} thread(s) checked, ${waiting || input.pendingApprovals} total draft(s) waiting for your approval.`
    : `${input.agentLabel} finished autonomously — ${input.leadsFound} lead(s) found, ${delivered("send_outreach")} first-touch email(s) sent, ${input.threadsChecked} thread(s) checked, ${delivered("send_reply")} reply(ies) sent.${notes.length ? ` ${notes.join(". ")}.` : ""}`;
  return guardRunSummary(prose, input.receipts);
}

