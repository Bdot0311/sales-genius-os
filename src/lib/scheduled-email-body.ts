import DOMPurify from "dompurify";
import { toReadableText } from "./message-body";

export interface ScheduledEmailBody {
  body_html: string | null;
  body_text: string | null;
}

/** Edit the rendered message, not the lossy plain-text alternative. */
export function scheduledEmailEditorHtml(email: ScheduledEmailBody): string {
  if (email.body_html) return DOMPurify.sanitize(email.body_html);
  const text = toReadableText(email.body_text);
  return text.split("\n").map((line) => {
    const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<div>${escaped || "<br>"}</div>`;
  }).join("");
}

/** Subject/time-only saves leave both original body columns untouched. */
export function savedScheduledEmailBody(email: ScheduledEmailBody, editedHtml: string | null): ScheduledEmailBody {
  if (editedHtml === null) return { body_html: email.body_html, body_text: email.body_text };
  const body_html = DOMPurify.sanitize(editedHtml);
  return { body_html, body_text: toReadableText(body_html) };
}