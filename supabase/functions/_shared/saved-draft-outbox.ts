import { appendSignatureToBody } from "./signature.ts";
import { htmlToPlainText } from "./plain-text.ts";

export interface SavedDraft {
  id: string;
  subject: string | null;
  body: string | null;
}

export function draftOutboxItem(draft: SavedDraft, accountId: string, when: string, signature: string) {
  const body = appendSignatureToBody(draft.body ?? "", signature);
  const firstHtml = body.search(/<[a-z][\s\S]*?>/i);
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const textHtml = (text: string) => text.split(/\r?\n/).map(line => `<div>${escape(line) || "<br>"}</div>`).join("");
  const html = firstHtml < 0 ? textHtml(body) : textHtml(body.slice(0, firstHtml)) + body.slice(firstHtml);
  return {
    draft_id: draft.id, original_subject: draft.subject ?? "", original_body: draft.body ?? "",
    body_html: html, body_text: htmlToPlainText(body), sending_account_id: accountId, scheduled_at: when,
  };
}

export interface DraftQueueResult { draft_id: string; queued?: boolean; error?: string; email_id?: string; code?: string; scheduled_at?: string }

export function draftSendCounts(results: { sent?: boolean; awaiting_confirmation?: boolean }[]) {
  return {
    sentCount: results.filter(result => result.sent === true).length,
    queuedCount: results.filter(result => result.awaiting_confirmation === true).length,
    failedCount: results.filter(result => result.sent !== true && result.awaiting_confirmation !== true).length,
  };
}

export function draftQueueSummary(requestedIds: string[], results: DraftQueueResult[]) {
  const byId = new Map(results.map(result => [result.draft_id, result]));
  const complete = [...new Set(requestedIds)].map(id => byId.get(id) ?? { draft_id: id, error: "Draft no longer available; refresh before retrying." });
  return { requested: complete.length, queued: complete.filter(result => result.queued === true).length, failed: complete.filter(result => result.queued !== true).length, results: complete };
}