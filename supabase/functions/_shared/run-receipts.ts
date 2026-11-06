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

/** Receipts implied by the counters agent-run already computed. */
export function receiptsFromRun(input: {
  outreachSent: number;
  pendingApprovals: number;
  repliesSent: number;
  sendFailed: number;
  unpersisted: number;
}): ToolReceipt[] {
  const receipts: ToolReceipt[] = [];
  if (input.outreachSent > 0) {
    receipts.push({ toolName: "send_outreach", status: "ok", detail: String(input.outreachSent) });
  }
  if (input.pendingApprovals > 0) {
    receipts.push({ toolName: "send_outreach", status: "approved", detail: String(input.pendingApprovals) });
  }
  if (input.repliesSent > 0) {
    receipts.push({ toolName: "send_drafts", status: "ok", detail: String(input.repliesSent) });
  }
  if (input.sendFailed > 0) {
    receipts.push({ toolName: "send_outreach", status: "failed", detail: String(input.sendFailed) });
  }
  if (input.unpersisted > 0) {
    receipts.push({
      toolName: "send_outreach",
      status: "provider_accepted_unpersisted",
      detail: String(input.unpersisted),
    });
  }
  return receipts;
}
