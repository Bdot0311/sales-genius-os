/**
 * Does this message ask for copy to be checked?
 *
 * The agent has audit_email, and the prompt tells it in as many words to "call
 * audit_email FIRST and answer from what it returns. Do not give copywriting
 * opinions in place of it." It does not. Asked twice to audit the same email it
 * returned six bullets, then seven — a deterministic checker cannot do that —
 * and the extra one cited a "75-word ceiling (90 absolute max)" when the
 * checker's thresholds are 50, 100 and 140. Those numbers are in the skill
 * files, so the model was reading the playbook out of its own prompt and
 * presenting it as findings.
 *
 * That is the whole "are the skills working" question answered: they are in
 * the prompt and they are being used as recollection rather than as checks. A
 * check the model may skip is a check nobody can rely on, so the request shape
 * decides here instead, and the model is made to call the tool.
 *
 * Deliberately conservative. It needs BOTH an explicit ask to review AND
 * something email-shaped in the message, because forcing a tool call on
 * "how do I write better subject lines?" would be worse than the problem.
 */

const REVIEW_INTENT = [
  /\baudit\b/i,
  /\breview\b/i,
  /\bcritique\b/i,
  /\bwhat(?:'s| is| are)\s+wrong\b/i,
  /\bwhat do you think of\b/i,
  /\bhow(?:'s| is)\s+this\b/i,
  /\bcheck\s+(?:this|the|my)\b/i,
  /\brate\s+(?:this|my)\b/i,
  /\bgood enough\b/i,
  /\bany\s+good\b/i,
];

/** A greeting or a sign-off is the clearest sign an actual email is pasted. */
const EMAIL_SHAPE = [
  // After a colon as well as at a line start: people paste inline, as
  // "review this: Hi Sam, ...", and anchoring to the line start alone missed
  // exactly that shape. Still needs a capitalised name and a comma, so "say hi
  // sam" does not qualify.
  // Case-tolerant on the greeting, case-SENSITIVE on the name: the whole
  // point of [A-Z] is that a real greeting capitalises the person, so an /i
  // flag here would defeat it.
  /(?:^|[:\n]\s*)(?:[Hh]i|[Hh]ello|[Hh]ey|[Dd]ear)\s+[A-Z][\w'-]*\s*,/m,
  /^\s*(?:thanks|cheers|best|regards|sincerely)\b/im,
  /^\s*P\.?S\.?[:\s]/im,
  /^subject:/im,
];

export function looksLikePastedEmail(message: string): boolean {
  const text = String(message ?? "");
  if (EMAIL_SHAPE.some((r) => r.test(text))) return true;
  // Fallback for a pasted body with no greeting: substantial, and laid out in
  // paragraphs rather than written as one conversational sentence.
  const words = (text.match(/\S+/g) ?? []).length;
  const breaks = (text.match(/\n/g) ?? []).length;
  return words >= 40 && breaks >= 2;
}

export function wantsCopyAudit(message: string): boolean {
  const text = String(message ?? "");
  if (!text.trim()) return false;
  return REVIEW_INTENT.some((r) => r.test(text)) && looksLikePastedEmail(text);
}
